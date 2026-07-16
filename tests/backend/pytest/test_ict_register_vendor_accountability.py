from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.models import (
    Department,
    OrphanedItem,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
    VendorRiskLink,
)
from app.models.activity_log import ActivityAction, ActivityEntityType, ActivityLog
from app.models.user import AccessScope


def _payload(*, owner_id: int, department_id: int) -> dict[str, object]:
    return {
        "name": "Canonical accountability vendor",
        "process": "ICT services",
        "department_id": department_id,
        "outsourcing_owner_user_id": owner_id,
        "vendor_type": "ict",
    }


def _vendor(*, name: str, owner_id: int, department_id: int) -> Vendor:
    return Vendor(
        name=name,
        process="ICT services",
        department_id=department_id,
        outsourcing_owner_user_id=owner_id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
    )


async def _grant(
    db_session: AsyncSession,
    role: Role,
    resource: str,
    action: str,
) -> None:
    permission = Permission(
        resource=resource,
        action=action,
        description=f"{resource}:{action}",
    )
    db_session.add(permission)
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


@pytest.mark.parametrize(
    "access_scope",
    [AccessScope.DEPARTMENT, AccessScope.MANAGER],
)
@pytest.mark.asyncio
async def test_scoped_vendor_creator_can_assign_any_active_cross_department_user(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_platform_admin: User,
    access_scope: AccessScope,
):
    creator_role = Role(
        name=f"scoped_vendor_creator_{access_scope.value}",
        display_name="Scoped Vendor Creator",
        description="Vendor creation without directory or register read authority",
    )
    other_department = Department(
        name=f"Cross-department Vendor Owner {access_scope.value}",
        code=f"V-{access_scope.value}",
    )
    db_session.add_all([creator_role, other_department])
    await db_session.flush()
    await _grant(db_session, creator_role, "vendors", "write")

    creator = User(
        name="Scoped Vendor Creator",
        email=f"scoped-vendor-creator-{access_scope.value}@example.test",
        role_id=creator_role.id,
        department_id=test_department.id,
        access_scope=access_scope,
        is_active=True,
    )
    cross_department_owner = User(
        name="Cross-department Vendor Owner",
        email=f"cross-vendor-owner-{access_scope.value}@example.test",
        role_id=test_user_platform_admin.role_id,
        department_id=other_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add_all([creator, cross_department_owner])
    await db_session.commit()

    async with client_factory(user=creator) as client:
        lookup = await client.get(
            "/api/v1/users/lookup/vendor-owners",
            params={"q": cross_department_owner.email},
        )
        department_lookup = await client.get(
            "/api/v1/departments/lookup/vendor-owners",
            params={"q": other_department.code},
        )
        created = await client.post(
            "/api/v1/vendors",
            json=_payload(
                owner_id=cross_department_owner.id,
                department_id=test_department.id,
            ),
        )

    assert lookup.status_code == 200, lookup.text
    assert lookup.json() == [
        {
            "id": cross_department_owner.id,
            "name": cross_department_owner.name,
            "email": cross_department_owner.email,
            "role_name": test_user_platform_admin.role.name,
            "department_id": other_department.id,
            "department_name": other_department.name,
        }
    ]
    assert department_lookup.status_code == 200, department_lookup.text
    assert department_lookup.json() == [
        {
            "id": other_department.id,
            "name": other_department.name,
            "code": other_department.code,
        }
    ]
    assert created.status_code == 201, created.text
    assert created.json()["outsourcing_owner"] == {
        "name": cross_department_owner.name,
        "email": cross_department_owner.email,
        "role_name": test_user_platform_admin.role.name,
        "department_name": other_department.name,
    }
    assert created.json()["owner_orphaned"] is False
    assert created.json()["ownership_status"] == "assigned"


@pytest.mark.asyncio
async def test_platform_admin_owner_access_is_record_specific_and_does_not_expand_links(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_platform_admin: User,
):
    owned = _vendor(
        name="Platform-admin-owned Vendor",
        owner_id=test_user_platform_admin.id,
        department_id=test_department.id,
    )
    unrelated = _vendor(
        name="Unrelated Vendor",
        owner_id=test_user_cro.id,
        department_id=test_department.id,
    )
    db_session.add_all([owned, unrelated])
    await db_session.commit()

    async with client_factory(user=test_user_platform_admin) as client:
        listing = await client.get("/api/v1/vendors")
        detail = await client.get(f"/api/v1/vendors/{owned.id}")
        hidden = await client.get(f"/api/v1/vendors/{unrelated.id}")
        updated = await client.patch(
            f"/api/v1/vendors/{owned.id}",
            json={"name": "Owner-maintained Vendor"},
        )
        governance_update = await client.patch(
            f"/api/v1/vendors/{owned.id}",
            json={"outsourcing_owner_user_id": test_user_cro.id},
        )
        archived = await client.delete(f"/api/v1/vendors/{owned.id}")
        created = await client.post(
            "/api/v1/vendors",
            json=_payload(
                owner_id=test_user_cro.id,
                department_id=test_department.id,
            ),
        )
        linked_risks = await client.get(
            f"/api/v1/vendors/{owned.id}/linked-risks"
        )
        owner_lookup = await client.get(
            "/api/v1/users/lookup/vendor-owners",
            params={"q": test_user_cro.email},
        )
        department_lookup = await client.get(
            "/api/v1/departments/lookup/vendor-owners",
            params={"q": test_department.code},
        )

    assert listing.status_code == 200, listing.text
    assert [row["id"] for row in listing.json()["items"]] == [owned.id]
    assert listing.json()["capabilities"]["can_create"] is False
    assert detail.status_code == 200, detail.text
    assert detail.json()["derived"] is None
    assert detail.json()["capabilities"]["can_read"] is True
    assert detail.json()["capabilities"]["can_update"] is True
    assert detail.json()["capabilities"]["can_archive"] is False
    assert detail.json()["capabilities"]["can_restore"] is False
    assert detail.json()["capabilities"]["can_view_linked_risks"] is False
    assert detail.json()["capabilities"]["can_view_contracts"] is False
    assert detail.json()["capabilities"]["can_view_asset_links"] is False
    assert hidden.status_code == 404
    assert updated.status_code == 200, updated.text
    assert governance_update.status_code == 403
    assert archived.status_code == 403
    assert created.status_code == 403
    assert linked_risks.status_code == 403
    assert owner_lookup.status_code == 403
    assert department_lookup.status_code == 403


@pytest.mark.asyncio
async def test_record_owner_with_link_permissions_gets_no_linked_capabilities_or_data(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    owner_role = Role(
        name="vendor_record_owner_with_link_permissions",
        display_name="Vendor Record Owner With Link Permissions",
        description="Exercises the assigned-owner exception without vendors:read.",
    )
    db_session.add(owner_role)
    await db_session.flush()
    for resource, action in (
        ("vendors", "delete"),
        ("risks", "read"),
        ("risks", "write"),
        ("controls", "read"),
        ("controls", "write"),
        ("vendor_contracts", "read"),
        ("vendor_contracts", "write"),
        ("issues", "write"),
    ):
        await _grant(db_session, owner_role, resource, action)

    owner = User(
        name="Vendor Record Owner",
        email="vendor-record-owner@example.test",
        role_id=owner_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    vendor = _vendor(
        name="Record-only Vendor",
        owner_id=0,
        department_id=test_department.id,
    )
    risk = Risk(
        risk_id_code="R-VENDOR-NO-LEAK",
        name="Linked risk that must not leak",
        process="Operations",
        category="Third Party",
        description="Visible risk behind a Vendor link.",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
        is_priority=False,
    )
    db_session.add_all([owner, risk])
    await db_session.flush()
    vendor.outsourcing_owner_user_id = owner.id
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(VendorRiskLink(vendor_id=vendor.id, risk_id=risk.id))
    await db_session.commit()

    async with client_factory(user=owner) as client:
        listing = await client.get("/api/v1/vendors")
        detail = await client.get(f"/api/v1/vendors/{vendor.id}")
        linked_risks = await client.get(f"/api/v1/vendors/{vendor.id}/linked-risks")
        linked_controls = await client.get(f"/api/v1/vendors/{vendor.id}/linked-controls")
        linked_kris = await client.get(f"/api/v1/vendors/{vendor.id}/linked-kris")
        asset_links = await client.get(f"/api/v1/vendors/{vendor.id}/asset-links")
        process_links = await client.get(f"/api/v1/vendors/{vendor.id}/process-links")
        contracts = await client.get(f"/api/v1/vendors/{vendor.id}/contracts")
        sub_outsourcing = await client.get(f"/api/v1/vendors/{vendor.id}/sub-outsourcing")
        archive = await client.delete(f"/api/v1/vendors/{vendor.id}")
        export = await client.get("/api/v1/reports/vendors/export", params={"format": "csv"})

    assert listing.status_code == 200, listing.text
    assert listing.json()["items"][0]["linked_risks"] == []
    assert detail.status_code == 200, detail.text
    assert detail.json()["linked_risks"] == []
    capabilities = detail.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_update"] is True
    assert capabilities["can_manage_accountability"] is False
    assert capabilities["can_archive"] is False
    assert capabilities["can_restore"] is False
    assert all(
        capabilities[key] is False
        for key in (
            "can_create_linked_risk",
            "can_create_linked_control",
            "can_create_linked_kri",
            "can_link_risk",
            "can_link_control",
            "can_link_kri",
            "can_view_linked_risks",
            "can_view_linked_controls",
            "can_view_linked_kris",
            "can_create_issue",
            "can_view_contracts",
            "can_manage_contracts",
            "can_view_sub_outsourcing",
            "can_manage_sub_outsourcing",
            "can_view_asset_links",
            "can_manage_asset_links",
            "can_manage_process_links",
        )
    )
    assert linked_risks.status_code == 403
    assert linked_controls.status_code == 403
    assert linked_kris.status_code == 403
    assert asset_links.status_code == 403
    assert process_links.status_code == 403
    assert contracts.status_code == 404
    assert sub_outsourcing.status_code == 404
    assert archive.status_code == 403
    assert export.status_code == 403


@pytest.mark.asyncio
async def test_unassigned_platform_admin_has_no_vendor_or_assignment_directory_access(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_platform_admin: User,
):
    outsider = User(
        name="Unassigned Platform Admin",
        email="unassigned-platform-admin@example.test",
        role_id=test_user_platform_admin.role_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    vendor = _vendor(
        name="Unrelated Vendor for anti-enumeration",
        owner_id=test_user_cro.id,
        department_id=test_department.id,
    )
    db_session.add_all([outsider, vendor])
    await db_session.commit()

    async with client_factory(user=outsider) as client:
        listing = await client.get("/api/v1/vendors")
        detail = await client.get(f"/api/v1/vendors/{vendor.id}")
        owner_lookup = await client.get("/api/v1/users/lookup/vendor-owners")
        department_lookup = await client.get(
            "/api/v1/departments/lookup/vendor-owners"
        )

    assert listing.status_code == 403
    assert detail.status_code == 404
    assert owner_lookup.status_code == 403
    assert department_lookup.status_code == 403


@pytest.mark.asyncio
async def test_vendor_requires_an_active_user_relationship_and_lookup_excludes_inactive_users(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_employee: User,
):
    test_user_employee.is_active = False
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        lookup = await client.get(
            "/api/v1/users/lookup/vendor-owners",
            params={"q": test_user_employee.email},
        )
        inactive_owner = await client.post(
            "/api/v1/vendors",
            json=_payload(
                owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
        free_text_only = await client.post(
            "/api/v1/vendors",
            json={
                **_payload(
                    owner_id=test_user_employee.id,
                    department_id=test_department.id,
                ),
                "outsourcing_owner_user_id": None,
                "outsourcing_owner_name": test_user_employee.name,
            },
        )

    assert lookup.status_code == 200, lookup.text
    assert lookup.json() == []
    assert inactive_owner.status_code == 400
    assert "active user" in inactive_owner.json()["detail"]
    assert free_text_only.status_code == 422


@pytest.mark.asyncio
async def test_vendor_owner_deactivation_surfaces_orphan_locks_mutation_and_resolves_atomically(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_platform_admin: User,
):
    vendor = _vendor(
        name="Orphan-governed Vendor",
        owner_id=test_user_employee.id,
        department_id=test_department.id,
    )
    risk = Risk(
        risk_id_code="R-VENDOR-ORPHAN",
        name="Vendor orphan link target",
        process="Operations",
        category="Third Party",
        description="Target used to verify orphan mutation locks.",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
        is_priority=False,
    )
    db_session.add_all([vendor, risk])
    await db_session.commit()
    vendor_id = vendor.id
    vendor_name = vendor.name
    risk_id = risk.id
    former_owner_name = test_user_employee.name
    replacement_owner_id = test_user_platform_admin.id
    replacement_owner_name = test_user_platform_admin.name
    resolver_id = test_user_cro.id

    async with client_factory(user=test_user_platform_admin) as client:
        deactivated = await client.patch(
            f"/api/v1/users/{test_user_employee.id}",
            json={"is_active": False},
        )

    async with client_factory(
        headers={"X-Mock-User-Id": str(resolver_id)}
    ) as client:
        detail = await client.get(f"/api/v1/vendors/{vendor_id}")
        overview = await client.get(
            "/api/v1/orphaned-items/overview",
            params={"item_type": "vendor"},
        )
        blocked_update = await client.patch(
            f"/api/v1/vendors/{vendor_id}",
            json={"name": "Must stay locked"},
        )
        blocked_link = await client.post(
            f"/api/v1/vendors/{vendor_id}/linked-risks",
            json={"risk_id": risk_id},
        )

    assert deactivated.status_code == 200, deactivated.text
    assert detail.status_code == 200, detail.text
    assert detail.json()["outsourcing_owner"]["name"] == former_owner_name
    assert detail.json()["owner_orphaned"] is True
    assert detail.json()["ownership_status"] == "pending_governance"
    assert detail.json()["capabilities"]["can_update"] is False
    assert overview.status_code == 200, overview.text
    assert overview.json()["stats"]["vendor_count"] == 1
    assert overview.json()["stats"]["total_count"] >= 1
    assert len(overview.json()["items"]) == 1
    orphan = overview.json()["items"][0]
    assert orphan["item_type"] == "vendor"
    assert orphan["responsibility_role"] == "outsourcing_owner"
    assert orphan["item_name"] == vendor_name
    assert orphan["department_name"] == test_department.name
    assert orphan["previous_owner_name"] == former_owner_name
    assert orphan["capabilities"] == {
        "can_resolve": True,
        "can_view_detail": True,
        "requires_owner": True,
        "requires_risk": False,
        "requires_department": False,
    }
    assert blocked_update.status_code == 409
    assert blocked_link.status_code == 409

    async with client_factory(
        headers={"X-Mock-User-Id": str(resolver_id)}
    ) as client:
        resolved = await client.post(
            f"/api/v1/orphaned-items/{orphan['id']}/resolve",
            json={"new_owner_id": replacement_owner_id},
        )
        stale = await client.post(
            f"/api/v1/orphaned-items/{orphan['id']}/resolve",
            json={"new_owner_id": resolver_id},
        )
        reassigned = await client.get(f"/api/v1/vendors/{vendor_id}")

    assert resolved.status_code == 200, resolved.text
    assert stale.status_code == 409
    assert reassigned.status_code == 200, reassigned.text
    assert reassigned.json()["outsourcing_owner_user_id"] == replacement_owner_id
    assert reassigned.json()["outsourcing_owner"]["name"] == replacement_owner_name
    assert reassigned.json()["owner_orphaned"] is False
    assert reassigned.json()["ownership_status"] == "assigned"

    db_session.expire_all()
    persisted = await db_session.get(Vendor, vendor_id)
    assert persisted is not None
    assert persisted.outsourcing_owner_user_id == replacement_owner_id
    orphan_status = await db_session.scalar(
        select(OrphanedItem.status).where(OrphanedItem.id == orphan["id"])
    )
    audit = await db_session.scalar(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.VENDOR,
            ActivityLog.entity_id == vendor_id,
            ActivityLog.action == ActivityAction.UPDATE,
        )
    )
    assert orphan_status == "resolved"
    assert audit is not None
    assert audit.actor_id == resolver_id
    assert audit.changes == {
        "outsourcing_owner_user_id": {
            "old": "[REDACTED]",
            "new": "[REDACTED]",
        }
    }


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_vendor_owner_update_and_deactivation_are_serialized(
    async_engine,
    db_session: AsyncSession,
    client_factory,
    test_user: User,
    test_user_employee: User,
    test_department: Department,
):
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL transaction-scoped advisory locks")

    vendor = _vendor(
        name="Concurrent owner-governed Vendor",
        owner_id=test_user_employee.id,
        department_id=test_department.id,
    )
    db_session.add(vendor)
    await db_session.commit()
    vendor_id = vendor.id
    owner_id = test_user_employee.id

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    async with client_factory(
        user=test_user_employee,
        settings=settings,
        db_override=override_get_db,
    ) as owner_client:
        async with client_factory(
            user=test_user,
            settings=settings,
            db_override=override_get_db,
        ) as admin_client:
            updated, deactivated = await asyncio.wait_for(
                asyncio.gather(
                    owner_client.patch(
                        f"/api/v1/vendors/{vendor_id}",
                        json={"name": "Serialized Vendor update"},
                    ),
                    admin_client.patch(
                        f"/api/v1/users/{owner_id}",
                        json={"is_active": False},
                    ),
                ),
                timeout=10,
            )

    assert deactivated.status_code == 200, deactivated.text
    assert updated.status_code in {200, 409}, updated.text
    async with session_maker() as session:
        owner = await session.get(User, owner_id)
        persisted = await session.get(Vendor, vendor_id)
        orphan_status = await session.scalar(
            select(OrphanedItem.status).where(
                OrphanedItem.item_type == "vendor",
                OrphanedItem.item_id == vendor_id,
                OrphanedItem.responsibility_role == "outsourcing_owner",
            )
        )

    assert owner is not None and owner.is_active is False
    assert persisted is not None and persisted.outsourcing_owner_user_id == owner_id
    assert orphan_status == "pending"
