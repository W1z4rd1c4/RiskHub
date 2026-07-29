from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.exceptions import ConflictError
from app.db.rbac_seed_contract import RBAC_ROLE_PERMISSIONS, expand_permission_keys
from app.models import (
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    Permission,
    Process,
    ProcessAssetLink,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.user import AccessScope
from app.services._orphaned_items import flag_orphaned_items, resolve_orphan


def _payload(
    *,
    business_owner_id: int,
    ict_owner_id: int,
    department_id: int,
) -> dict[str, object]:
    return {
        "name": "Canonical ownership asset",
        "asset_type": "application",
        "business_owner_user_id": business_owner_id,
        "ict_owner_user_id": ict_owner_id,
        "owning_department_id": department_id,
    }


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


def _vendor(
    *,
    name: str,
    department_id: int,
    owner_id: int,
    archived: bool = False,
) -> Vendor:
    return Vendor(
        name=name,
        process="IT",
        department_id=department_id,
        outsourcing_owner_user_id=owner_id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        is_archived=archived,
    )


@pytest.mark.asyncio
async def test_asset_allows_same_user_in_both_roles_and_projects_safe_relationships(
    client_factory,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    async with client_factory(user=test_user_cro) as client:
        response = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_employee.id,
                ict_owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
        owner_lookup = await client.get(
            "/api/v1/users/lookup/asset-owners",
            params={"q": test_user_employee.email},
        )
        department_lookup = await client.get(
            "/api/v1/departments/lookup/asset-owners",
            params={"q": test_department.code},
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["business_owner_user_id"] == test_user_employee.id
    assert body["ict_owner_user_id"] == test_user_employee.id
    assert body["business_owner"]["name"] == test_user_employee.name
    assert "email" not in body["business_owner"]
    assert "email" not in body["ict_owner"]
    assert body["owning_department"] == {
        "name": test_department.name,
        "code": test_department.code,
    }
    assert body["ownership_status"] == "assigned"
    assert body["business_owner_orphaned"] is False
    assert body["ict_owner_orphaned"] is False

    assert owner_lookup.status_code == 200, owner_lookup.text
    assert owner_lookup.json() == [
        {
            "id": test_user_employee.id,
            "name": test_user_employee.name,
            "email": test_user_employee.email,
            "role_name": test_user_employee.role.name,
            "department_id": test_department.id,
            "department_name": test_department.name,
        }
    ]
    assert department_lookup.status_code == 200, department_lookup.text
    assert department_lookup.json() == [
        {
            "id": test_department.id,
            "name": test_department.name,
            "code": test_department.code,
        }
    ]


@pytest.mark.parametrize(
    "access_scope",
    [AccessScope.DEPARTMENT, AccessScope.MANAGER],
)
@pytest.mark.asyncio
async def test_scoped_asset_creator_can_use_cross_department_assignment_lookups(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_department: Department,
    access_scope: AccessScope,
):
    scoped_creator_role = Role(
        name=f"scoped_asset_creator_{access_scope.value}",
        display_name="Scoped Asset Creator",
        description="Custom role with Asset creation authority only",
    )
    other_department = Department(
        name=f"Cross-scope Asset Department {access_scope.value}",
        code=f"XAS-{access_scope.value}",
    )
    db_session.add_all([scoped_creator_role, other_department])
    await db_session.flush()
    await _grant(db_session, scoped_creator_role, "assets", "write")

    scoped_creator = User(
        name="Scoped Asset Creator",
        email=f"scoped-asset-creator-{access_scope.value}@example.test",
        role_id=scoped_creator_role.id,
        department_id=test_department.id,
        access_scope=access_scope,
        is_active=True,
    )
    cross_department_owner = User(
        name="Cross-department Asset Owner",
        email=f"cross-department-asset-owner-{access_scope.value}@example.test",
        role_id=test_user_employee.role_id,
        department_id=other_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add_all([scoped_creator, cross_department_owner])
    await db_session.commit()

    assert await db_session.scalar(select(Asset.id).limit(1)) is None

    async with client_factory(user=scoped_creator) as client:
        owner_lookup = await client.get(
            "/api/v1/users/lookup/asset-owners",
            params={"q": cross_department_owner.email},
        )
        department_lookup = await client.get(
            "/api/v1/departments/lookup/asset-owners",
            params={"q": other_department.code},
        )

    assert owner_lookup.status_code == 200, owner_lookup.text
    assert [row["id"] for row in owner_lookup.json()] == [cross_department_owner.id]
    assert department_lookup.status_code == 200, department_lookup.text
    assert [row["id"] for row in department_lookup.json()] == [other_department.id]

    async with client_factory(user=test_user_employee) as client:
        denied_owner_lookup = await client.get("/api/v1/users/lookup/asset-owners")
        denied_department_lookup = await client.get(
            "/api/v1/departments/lookup/asset-owners"
        )

    assert denied_owner_lookup.status_code == 403
    assert denied_department_lookup.status_code == 403


@pytest.mark.asyncio
async def test_asset_owner_and_owning_department_head_get_update_not_archive(
    client_factory,
    test_user_cro: User,
    test_user_employee: User,
    test_user_department_head: User,
    test_department: Department,
):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_employee.id,
                ict_owner_id=test_user_cro.id,
                department_id=test_department.id,
            ),
        )
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]

    for user, name in (
        (test_user_employee, "Business owner update"),
        (test_user_department_head, "Department head update"),
    ):
        async with client_factory(user=user) as client:
            detail = await client.get(f"/api/v1/assets/{asset_id}")
            updated = await client.patch(
                f"/api/v1/assets/{asset_id}",
                json={"name": name},
            )
            archived = await client.delete(f"/api/v1/assets/{asset_id}")

        assert detail.status_code == 200, detail.text
        assert detail.json()["capabilities"] == {
            "can_read": True,
            "can_update": True,
            "can_archive": False,
            "can_restore": False,
            "has_pending_change": False,
            "business_edit_blocked": False,
            "can_cancel_pending_change": False,
        }
        assert updated.status_code == 200, updated.text
        assert updated.json()["name"] == name
        assert archived.status_code == 403


@pytest.mark.asyncio
async def test_asset_dual_role_orphans_resolve_independently_and_block_edits(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_employee.id,
                ict_owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
        counterpart = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_cro.id,
                ict_owner_id=test_user_cro.id,
                department_id=test_department.id,
            )
            | {"name": "Governance link counterpart"},
        )
    assert created.status_code == 201, created.text
    assert counterpart.status_code == 201, counterpart.text
    asset_id = created.json()["id"]
    counterpart_id = counterpart.json()["id"]
    created_asset = await db_session.get(Asset, asset_id)
    assert created_asset is not None
    initial_governance_version = created_asset.governance_version
    former_owner_id = test_user_employee.id

    test_user_employee.is_active = False
    await db_session.flush()
    created_orphans = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    asset_orphans = sorted(
        (orphan for orphan in created_orphans if orphan.item_type == "asset"),
        key=lambda orphan: orphan.responsibility_role or "",
    )
    assert [orphan.responsibility_role for orphan in asset_orphans] == [
        "business_owner",
        "ict_owner",
    ]

    async with client_factory(user=test_user_cro) as client:
        detail = await client.get(f"/api/v1/assets/{asset_id}")
        governance = await client.get(
            "/api/v1/orphaned-items/", params={"item_type": "asset"}
        )
        blocked = await client.patch(
            f"/api/v1/assets/{asset_id}",
            json={"name": "Bypass attempt"},
        )
        blocked_link = await client.post(
            f"/api/v1/assets/{asset_id}/asset-links",
            json={
                "dependent_asset_id": asset_id,
                "supporting_asset_id": counterpart_id,
            },
        )
    assert detail.status_code == 200, detail.text
    assert detail.json()["business_owner_orphaned"] is True
    assert detail.json()["ict_owner_orphaned"] is True
    assert detail.json()["ownership_status"] == "pending_governance"
    assert detail.json()["capabilities"]["can_update"] is False
    assert governance.status_code == 200, governance.text
    governance_rows = [row for row in governance.json() if row["item_id"] == asset_id]
    assert len(governance_rows) == 2
    assert {row["item_name"] for row in governance_rows} == {
        "Canonical ownership asset"
    }
    assert {row["item_identifier"] for row in governance_rows} == {None}
    assert blocked.status_code == 409, blocked.text
    assert blocked_link.status_code == 409, blocked_link.text

    business_orphan = next(
        orphan
        for orphan in asset_orphans
        if orphan.responsibility_role == "business_owner"
    )
    ict_orphan = next(
        orphan for orphan in asset_orphans if orphan.responsibility_role == "ict_owner"
    )
    cro_id = test_user_cro.id
    governance_department_id = test_department.id
    business_orphan_id = business_orphan.id
    ict_orphan_id = ict_orphan.id
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.ASSET,
        resource_id=asset_id,
        resource_name="Canonical ownership asset",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"name": {"old": "a", "new": "b"}},
        requested_by_id=cro_id,
        reason="Lock orphan reassignment",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.flush()
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind="asset.edit",
        primary_resource_type="asset",
        primary_resource_id=asset_id,
        primary_resource_name="Canonical ownership asset",
        scenario_snapshot={},
        base_versions={"asset": initial_governance_version},
        before_snapshot={},
        after_snapshot={},
        derived_impact_snapshot={},
        proposed_changes={},
        impacted_resources_snapshot=[],
        requested_by_id=cro_id,
    )
    db_session.add(proposal)
    await db_session.flush()
    impact_lock = GovernedMutationImpactLock(
        proposal_id=proposal.id,
        resource_type="asset",
        resource_id=asset_id,
        base_governance_version=initial_governance_version,
    )
    db_session.add(impact_lock)
    await db_session.commit()
    impact_lock_id = impact_lock.id
    approval_id = approval.id
    with pytest.raises(ConflictError, match="governed Asset change is pending"):
        await resolve_orphan(
            db_session,
            business_orphan_id,
            resolved_by_id=cro_id,
            new_owner_id=cro_id,
            department_id=governance_department_id,
        )
    await db_session.rollback()
    impact_lock = await db_session.get(GovernedMutationImpactLock, impact_lock_id)
    assert impact_lock is not None
    impact_lock.released_at = utc_now()
    impact_lock.release_reason = "test_continue_orphan_resolution"
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None
    approval.status = ApprovalStatus.CANCELLED
    await db_session.commit()
    await resolve_orphan(
        db_session,
        business_orphan_id,
        resolved_by_id=cro_id,
        new_owner_id=cro_id,
        department_id=governance_department_id,
    )
    asset = await db_session.get(Asset, asset_id)
    assert asset is not None
    assert asset.business_owner_user_id == cro_id
    assert asset.ict_owner_user_id == former_owner_id
    assert asset.governance_version == initial_governance_version + 1
    assert (
        await db_session.scalar(
            select(OrphanedItem.status).where(OrphanedItem.id == ict_orphan_id)
        )
        == "pending"
    )

    await resolve_orphan(
        db_session,
        ict_orphan_id,
        resolved_by_id=cro_id,
        new_owner_id=cro_id,
        department_id=governance_department_id,
    )
    db_session.expire_all()
    asset = await db_session.get(Asset, asset_id)
    assert asset is not None
    assert asset.business_owner_user_id == cro_id
    assert asset.ict_owner_user_id == cro_id
    assert asset.governance_version == initial_governance_version + 2


@pytest.mark.asyncio
async def test_asset_accepts_active_platform_admin_owner_and_rejects_inactive_relationships(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_platform_admin: User,
    test_department: Department,
):
    async with client_factory(user=test_user_platform_admin) as client:
        unassigned_platform_lookup = await client.get(
            "/api/v1/users/lookup/asset-owners"
        )
    assert unassigned_platform_lookup.status_code == 403

    async with client_factory(user=test_user_cro) as client:
        platform_lookup = await client.get(
            "/api/v1/users/lookup/asset-owners",
            params={"q": test_user_platform_admin.email},
        )
        platform_owner = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_platform_admin.id,
                ict_owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
    assert platform_lookup.status_code == 200, platform_lookup.text
    assert [owner["id"] for owner in platform_lookup.json()] == [
        test_user_platform_admin.id
    ]
    assert platform_owner.status_code == 201, platform_owner.text

    async with client_factory(user=test_user_platform_admin) as client:
        assigned_detail = await client.get(
            f"/api/v1/assets/{platform_owner.json()['id']}"
        )
        assigned_update = await client.patch(
            f"/api/v1/assets/{platform_owner.json()['id']}",
            json={"name": "Platform-admin-owned Asset"},
        )
        assigned_platform_lookup = await client.get(
            "/api/v1/users/lookup/asset-owners",
            params={"q": test_user_employee.email},
        )

    assert assigned_detail.status_code == 200, assigned_detail.text
    assert assigned_detail.json()["capabilities"]["can_update"] is True
    assert assigned_update.status_code == 200, assigned_update.text
    assert assigned_platform_lookup.status_code == 200, assigned_platform_lookup.text
    assert [row["id"] for row in assigned_platform_lookup.json()] == [
        test_user_employee.id
    ]

    test_user_employee.is_active = False
    await db_session.commit()
    async with client_factory(user=test_user_cro) as client:
        inactive_owner = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_employee.id,
                ict_owner_id=test_user_cro.id,
                department_id=test_department.id,
            ),
        )
    assert inactive_owner.status_code == 400, inactive_owner.text

    test_user_employee.is_active = True
    test_department.is_active = False
    await db_session.commit()
    async with client_factory(user=test_user_cro) as client:
        inactive_department = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_employee.id,
                ict_owner_id=test_user_cro.id,
                department_id=test_department.id,
            ),
        )
    assert inactive_department.status_code == 400, inactive_department.text


@pytest.mark.asyncio
async def test_asset_vendor_links_compose_asset_authority_with_vendor_visibility(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_department_head: User,
    test_department: Department,
):
    await _grant(
        db_session,
        test_user_department_head.role,
        "vendors",
        "read",
    )
    other_department = Department(
        name="Hidden Vendor Department",
        code="HVD",
        description="Outside canonical Vendor scope",
    )
    unrelated_user = User(
        name="Unrelated Asset Reader",
        email="unrelated-asset-reader@example.test",
        department_id=test_department.id,
        role_id=test_user_employee.role_id,
        is_active=True,
        access_scope=test_user_employee.access_scope,
    )
    db_session.add_all([other_department, unrelated_user])
    await db_session.flush()

    visible_vendor = _vendor(
        name="Visible Active Vendor",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
    )
    addable_vendor = _vendor(
        name="Visible Addable Vendor",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
    )
    archived_vendor = _vendor(
        name="Visible Archived Vendor",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        archived=True,
    )
    hidden_vendor = _vendor(
        name="Secret Cross Department Vendor",
        department_id=other_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all([visible_vendor, addable_vendor, archived_vendor, hidden_vendor])
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_employee.id,
                ict_owner_id=test_user_cro.id,
                department_id=test_department.id,
            ),
        )
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]

    links = [
        AssetVendorLink(
            asset_id=asset_id,
            vendor_id=vendor.id,
            ict_service_code=service_code,
        )
        for vendor, service_code in (
            (visible_vendor, "S01"),
            (archived_vendor, "S02"),
            (hidden_vendor, "S03"),
        )
    ]
    db_session.add_all(links)
    await db_session.commit()

    async with client_factory(user=test_user_employee) as client:
        owner_list = await client.get(f"/api/v1/assets/{asset_id}/vendor-links")
        hidden_add = await client.post(
            f"/api/v1/assets/{asset_id}/vendor-links",
            json={"vendor_id": hidden_vendor.id, "ict_service_code": "S04"},
        )
        hidden_remove = await client.delete(
            f"/api/v1/assets/{asset_id}/vendor-links/{links[2].id}"
        )
        added = await client.post(
            f"/api/v1/assets/{asset_id}/vendor-links",
            json={"vendor_id": addable_vendor.id, "ict_service_code": "S05"},
        )
        archived_vendor_detail = await client.get(
            f"/api/v1/vendors/{archived_vendor.id}"
        )
        archived_vendor_links = await client.get(
            f"/api/v1/vendors/{archived_vendor.id}/asset-links"
        )
        archived_remove = await client.delete(
            f"/api/v1/assets/{asset_id}/vendor-links/{links[1].id}"
        )
        owner_vendor = await client.get(f"/api/v1/vendors/{visible_vendor.id}")

    assert owner_list.status_code == 200, owner_list.text
    assert {row["vendor_name"] for row in owner_list.json()} == {
        visible_vendor.name,
        archived_vendor.name,
    }
    assert all(row["capabilities"]["can_delete"] for row in owner_list.json())
    assert hidden_vendor.name not in owner_list.text
    assert hidden_add.status_code == 404
    assert hidden_vendor.name not in hidden_add.text
    assert hidden_remove.status_code == 404
    assert hidden_vendor.name not in hidden_remove.text
    assert added.status_code == 201, added.text
    assert added.json()["capabilities"]["can_delete"] is True
    assert archived_vendor_detail.status_code == 200, archived_vendor_detail.text
    assert archived_vendor_detail.json()["capabilities"]["can_view_asset_links"] is True
    assert (
        archived_vendor_detail.json()["capabilities"]["can_manage_asset_links"] is False
    )
    assert archived_vendor_links.status_code == 200, archived_vendor_links.text
    assert [row["id"] for row in archived_vendor_links.json()] == [links[1].id]
    assert archived_vendor_links.json()[0]["capabilities"]["can_delete"] is True
    assert archived_remove.status_code == 204, archived_remove.text
    assert owner_vendor.status_code == 200, owner_vendor.text
    assert owner_vendor.json()["capabilities"]["can_view_asset_links"] is True
    assert owner_vendor.json()["capabilities"]["can_manage_asset_links"] is True

    async with client_factory(user=unrelated_user) as client:
        unrelated_list = await client.get(f"/api/v1/assets/{asset_id}/vendor-links")
        unrelated_vendor = await client.get(f"/api/v1/vendors/{visible_vendor.id}")
    assert unrelated_list.status_code == 200, unrelated_list.text
    assert all(
        row["capabilities"]["can_delete"] is False for row in unrelated_list.json()
    )
    assert unrelated_vendor.status_code == 200, unrelated_vendor.text
    assert unrelated_vendor.json()["capabilities"]["can_view_asset_links"] is True
    assert unrelated_vendor.json()["capabilities"]["can_manage_asset_links"] is False

    async with client_factory(user=test_user_department_head) as client:
        head_list = await client.get(f"/api/v1/assets/{asset_id}/vendor-links")
        head_vendor = await client.get(f"/api/v1/vendors/{visible_vendor.id}")
        head_remove = await client.delete(
            f"/api/v1/assets/{asset_id}/vendor-links/{added.json()['id']}"
        )
    assert head_list.status_code == 200, head_list.text
    assert all(row["capabilities"]["can_delete"] for row in head_list.json())
    assert head_vendor.status_code == 200, head_vendor.text
    assert head_vendor.json()["capabilities"]["can_view_asset_links"] is True
    assert head_vendor.json()["capabilities"]["can_manage_asset_links"] is True
    assert head_remove.status_code == 204, head_remove.text

    async with client_factory(user=test_user_cro) as client:
        global_list = await client.get(f"/api/v1/assets/{asset_id}/vendor-links")
    assert global_list.status_code == 200, global_list.text
    assert hidden_vendor.name in {row["vendor_name"] for row in global_list.json()}
    assert all(row["capabilities"]["can_delete"] for row in global_list.json())

    db_session.add(
        OrphanedItem(
            item_type="asset",
            item_id=asset_id,
            responsibility_role="business_owner",
            previous_owner_id=test_user_employee.id,
            status="pending",
        )
    )
    await db_session.commit()
    async with client_factory(user=test_user_employee) as client:
        pending_list = await client.get(f"/api/v1/assets/{asset_id}/vendor-links")
        pending_vendor = await client.get(f"/api/v1/vendors/{visible_vendor.id}")
        pending_vendor_links = await client.get(
            f"/api/v1/vendors/{visible_vendor.id}/asset-links"
        )
    assert pending_list.status_code == 200, pending_list.text
    assert all(
        row["capabilities"]["can_delete"] is False for row in pending_list.json()
    )
    assert pending_vendor.status_code == 200, pending_vendor.text
    assert pending_vendor.json()["capabilities"]["can_view_asset_links"] is True
    assert pending_vendor.json()["capabilities"]["can_manage_asset_links"] is False
    assert pending_vendor_links.status_code == 200, pending_vendor_links.text
    assert pending_vendor_links.json()
    assert all(
        row["capabilities"]["can_delete"] is False
        for row in pending_vendor_links.json()
    )


@pytest.mark.asyncio
async def test_inactive_owning_department_removes_department_head_asset_exception(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_department_head: User,
    test_department: Department,
):
    assert "assets:read" in expand_permission_keys(
        RBAC_ROLE_PERMISSIONS["department_head"]
    )
    await _grant(
        db_session,
        test_user_department_head.role,
        "vendors",
        "read",
    )
    await _grant(
        db_session,
        test_user_department_head.role,
        "assets",
        "read",
    )
    vendor = _vendor(
        name="Inactive Department Vendor",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
    )
    db_session.add(vendor)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/assets",
            json=_payload(
                business_owner_id=test_user_employee.id,
                ict_owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]

    async with client_factory(user=test_user_department_head) as client:
        active_detail = await client.get(f"/api/v1/assets/{asset_id}")
        active_vendor = await client.get(f"/api/v1/vendors/{vendor.id}")
    assert active_detail.status_code == 200, active_detail.text
    assert active_vendor.status_code == 200, active_vendor.text
    assert active_vendor.json()["capabilities"]["can_manage_asset_links"] is True

    test_department.is_active = False
    await db_session.commit()
    async with client_factory(user=test_user_department_head) as client:
        inactive_list = await client.get("/api/v1/assets")
        inactive_detail = await client.get(f"/api/v1/assets/{asset_id}")
        inactive_update = await client.patch(
            f"/api/v1/assets/{asset_id}", json={"name": "Hidden update"}
        )
        inactive_vendor = await client.get(f"/api/v1/vendors/{vendor.id}")
    assert inactive_list.status_code == 200, inactive_list.text
    assert inactive_list.json()["items"] == []
    assert inactive_detail.status_code == 404
    assert inactive_update.status_code == 404
    assert inactive_vendor.status_code == 200, inactive_vendor.text
    assert inactive_vendor.json()["capabilities"]["can_manage_asset_links"] is False

    async with client_factory(user=test_user_employee) as client:
        owner_detail = await client.get(f"/api/v1/assets/{asset_id}")
    assert owner_detail.status_code == 200, owner_detail.text

    async with client_factory(user=test_user_cro) as client:
        global_list = await client.get("/api/v1/assets")
        global_detail = await client.get(f"/api/v1/assets/{asset_id}")
        global_update = await client.patch(
            f"/api/v1/assets/{asset_id}", json={"name": "Global categorical update"}
        )
    assert [row["id"] for row in global_list.json()["items"]] == [asset_id]
    assert global_detail.status_code == 200, global_detail.text
    assert global_update.status_code == 200, global_update.text


@pytest.mark.asyncio
async def test_asset_projection_canonicalizes_and_redacts_unreadable_linked_context(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_department_head: User,
    test_department: Department,
):
    await _grant(db_session, test_user_employee.role, "vendors", "read")
    await _grant(db_session, test_user_department_head.role, "assets", "read")
    hidden_department = Department(name="Hidden Register", code="HREG")
    db_session.add(hidden_department)
    await db_session.flush()

    visible_process = Process(
        f_code="F75VISIBLE",
        l0_area="Operations",
        l1_process="Visible Process",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
        cif_override="no",
    )
    hidden_process = Process(
        f_code="F75HIDDEN",
        l0_area="Restricted",
        l1_process="Secret Process",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=hidden_department.id,
        cif_override="yes",
        impact_market_operations=5,
        impact_financial=5,
        rto_hours=2,
    )
    visible_support = Asset(
        name="Visible Supporting Asset",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    hidden_support = Asset(
        name="Secret Supporting Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=hidden_department.id,
    )
    visible_vendor = _vendor(
        name="Visible Projection Vendor",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
    )
    hidden_vendor = _vendor(
        name="Secret Projection Vendor",
        department_id=hidden_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all(
        [
            visible_process,
            hidden_process,
            visible_support,
            hidden_support,
            visible_vendor,
            hidden_vendor,
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/assets",
            json={
                **_payload(
                    business_owner_id=test_user_employee.id,
                    ict_owner_id=test_user_cro.id,
                    department_id=test_department.id,
                ),
                "confidentiality_rating": 1,
                "integrity_rating": 1,
                "availability_rating": 1,
                "authenticity_rating": 1,
                "impact_client": 1,
                "impact_regulatory": 1,
                "substitutability_rating": 1,
                "vendor_dependency_rating": 1,
                "preliminary_criticality": "low",
            },
        )
        filter_created = await client.post(
            "/api/v1/assets",
            json={
                **_payload(
                    business_owner_id=test_user_employee.id,
                    ict_owner_id=test_user_cro.id,
                    department_id=test_department.id,
                ),
                "name": "Hidden-only filter Asset",
                "confidentiality_rating": 1,
                "integrity_rating": 1,
                "availability_rating": 1,
                "authenticity_rating": 1,
                "impact_client": 1,
                "impact_regulatory": 1,
                "substitutability_rating": 1,
                "vendor_dependency_rating": 1,
                "preliminary_criticality": "low",
            },
        )
    assert created.status_code == 201, created.text
    assert filter_created.status_code == 201, filter_created.text
    asset_id = created.json()["id"]
    filter_asset_id = filter_created.json()["id"]

    db_session.add_all(
        [
            ProcessAssetLink(
                asset_id=asset_id,
                process_id=hidden_process.id,
                is_primary=True,
                spof="Ano",
            ),
            ProcessAssetLink(
                asset_id=asset_id,
                process_id=visible_process.id,
                is_primary=False,
                spof="Ne",
            ),
            ProcessAssetLink(
                asset_id=filter_asset_id,
                process_id=hidden_process.id,
                is_primary=True,
                spof="Ano",
            ),
            AssetAssetLink(
                dependent_asset_id=asset_id,
                supporting_asset_id=visible_support.id,
            ),
            AssetAssetLink(
                dependent_asset_id=asset_id,
                supporting_asset_id=hidden_support.id,
            ),
            AssetVendorLink(
                asset_id=asset_id,
                vendor_id=visible_vendor.id,
                ict_service_code="S01",
                contract_reference="VISIBLE-CONTRACT",
            ),
            AssetVendorLink(
                asset_id=asset_id,
                vendor_id=hidden_vendor.id,
                ict_service_code="S19",
                contract_reference="SECRET-CONTRACT",
            ),
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_employee) as client:
        response = await client.get(f"/api/v1/assets/{asset_id}")

    assert response.status_code == 200, response.text
    body = response.json()
    derived = body["derived"]
    assert body["primary_process_id"] is None
    assert derived["inputs"]["primary_process_id"] is None
    assert derived["primary_process_name"] is None
    assert derived["primary_process_criticality"] is None
    assert derived["linked_process_count"] == 1
    assert derived["cif_process_count"] == 0
    assert derived["cif_process_names"] == []
    assert derived["linked_asset_names"] == [visible_support.name]
    assert derived["linked_vendor_count"] == 1
    assert derived["vendor_names"] == [visible_vendor.name]
    assert derived["ict_service_codes"] == ["S01"]
    assert derived["contract_references"] == ["VISIBLE-CONTRACT"]
    assert derived["resulting_criticality"] == "low"
    assert derived["article8_classification"] == "non_critical"
    assert derived["cif"] == "no"
    assert derived["spof"] == "no"
    assert derived["external_dependency"] == "yes"
    assert derived["legacy"] == "no"
    for secret in (
        hidden_process.l1_process,
        hidden_support.name,
        hidden_vendor.name,
        "S19",
        "SECRET-CONTRACT",
    ):
        assert secret not in response.text

    for restricted_user in (test_user_employee, test_user_department_head):
        async with client_factory(user=restricted_user) as client:
            hidden_link = await client.get(
                "/api/v1/assets",
                params={
                    "search": "Hidden-only filter Asset",
                    "has_process_link": True,
                },
            )
            visible_low = await client.get(
                "/api/v1/assets",
                params={
                    "search": "Hidden-only filter Asset",
                    "has_process_link": False,
                    "criticality": "low",
                },
            )
            hidden_critical = await client.get(
                "/api/v1/assets",
                params={
                    "search": "Hidden-only filter Asset",
                    "criticality": "critical",
                },
            )

        assert hidden_link.status_code == 200, hidden_link.text
        assert hidden_link.json()["total"] == 0
        assert visible_low.status_code == 200, visible_low.text
        assert visible_low.json()["total"] == 1
        assert visible_low.json()["items"][0]["id"] == filter_asset_id
        assert visible_low.json()["items"][0]["derived"]["linked_process_count"] == 0
        assert (
            visible_low.json()["items"][0]["derived"]["resulting_criticality"] == "low"
        )
        assert hidden_critical.status_code == 200, hidden_critical.text
        assert hidden_critical.json()["total"] == 0

    async with client_factory(user=test_user_cro) as client:
        unrestricted_response = await client.get(f"/api/v1/assets/{asset_id}")
        cro_full_graph = await client.get(
            "/api/v1/assets",
            params={
                "search": "Hidden-only filter Asset",
                "has_process_link": True,
                "criticality": "critical",
            },
        )

    assert unrestricted_response.status_code == 200, unrestricted_response.text
    unrestricted = unrestricted_response.json()["derived"]
    assert unrestricted["primary_process_name"] == hidden_process.l1_process
    assert unrestricted["linked_process_count"] == 2
    assert unrestricted["linked_vendor_count"] == 2
    assert unrestricted["resulting_criticality"] == "critical"
    assert unrestricted["article8_classification"] == "critical"
    assert unrestricted["cif"] == "yes"
    assert unrestricted["spof"] == "yes"
    assert hidden_vendor.name in unrestricted["vendor_names"]
    assert cro_full_graph.status_code == 200, cro_full_graph.text
    assert cro_full_graph.json()["total"] == 1
    assert cro_full_graph.json()["items"][0]["id"] == filter_asset_id
    assert cro_full_graph.json()["items"][0]["derived"]["linked_process_count"] == 1
    assert (
        cro_full_graph.json()["items"][0]["derived"]["resulting_criticality"]
        == "critical"
    )


@pytest.mark.asyncio
async def test_department_head_projection_filters_supporting_assets_without_lazy_load(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_department_head: User,
    test_department: Department,
):
    assert "assets:read" in expand_permission_keys(
        RBAC_ROLE_PERMISSIONS["department_head"]
    )
    await _grant(
        db_session,
        test_user_department_head.role,
        "assets",
        "read",
    )
    hidden_department = Department(name="Hidden Support Department", code="HSD")
    db_session.add(hidden_department)
    await db_session.flush()

    dependent = Asset(
        name="Department Head Derived Asset",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
    )
    visible_support = Asset(
        name="Department Head Visible Support",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
    )
    hidden_support = Asset(
        name="Department Head Hidden Support",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=hidden_department.id,
    )
    db_session.add_all([dependent, visible_support, hidden_support])
    await db_session.flush()
    db_session.add_all(
        [
            AssetAssetLink(
                dependent_asset_id=dependent.id,
                supporting_asset_id=visible_support.id,
            ),
            AssetAssetLink(
                dependent_asset_id=dependent.id,
                supporting_asset_id=hidden_support.id,
            ),
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_department_head) as client:
        response = await client.get(f"/api/v1/assets/{dependent.id}")

    assert response.status_code == 200, response.text
    assert response.json()["derived"]["linked_asset_names"] == [visible_support.name]
    assert hidden_support.name not in response.text


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_same_user_dual_asset_roles_deactivation_is_serialized(
    async_engine,
    db_session: AsyncSession,
    client_factory,
    test_user: User,
    test_user_employee: User,
    test_department: Department,
):
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL transaction-scoped advisory locks")

    asset = Asset(
        name="Concurrent dual-role Asset",
        asset_type="application",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    db_session.add(asset)
    await db_session.commit()
    asset_id = asset.id
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

    async with client_factory(
        user=test_user_employee,
        settings=Settings(mock_auth_enabled=True, debug=True),
        db_override=override_get_db,
    ) as owner_client:
        async with client_factory(
            user=test_user,
            settings=Settings(mock_auth_enabled=True, debug=True),
            db_override=override_get_db,
        ) as admin_client:
            updated, deactivated = await asyncio.wait_for(
                asyncio.gather(
                    owner_client.patch(
                        f"/api/v1/assets/{asset_id}",
                        json={"name": "Serialized Asset update"},
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
        persisted = await session.get(Asset, asset_id)
        roles = set(
            (
                await session.execute(
                    select(OrphanedItem.responsibility_role).where(
                        OrphanedItem.item_type == "asset",
                        OrphanedItem.item_id == asset_id,
                        OrphanedItem.previous_owner_id == owner_id,
                        OrphanedItem.status == "pending",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert owner is not None and owner.is_active is False
        assert persisted is not None
        assert persisted.business_owner_user_id == owner_id
        assert persisted.ict_owner_user_id == owner_id
        assert roles == {"business_owner", "ict_owner"}
