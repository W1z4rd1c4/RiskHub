from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.exceptions import ConflictError
from app.models import (
    Asset,
    AssetVendorLink,
    Department,
    OrphanedItem,
    Permission,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.role import RoleType
from app.models.user import AccessScope
from app.schemas.process import ProcessUpdate
from app.services._ict_register_lifecycle.lifecycle import update_process_detail
from app.services._orphaned_items import flag_orphaned_items, resolve_orphan


def _payload(*, owner_id: int, department_id: int) -> dict[str, object]:
    return {
        "l0_area": "Operations",
        "l1_process": "Claims handling",
        "process_owner_user_id": owner_id,
        "owning_department_id": department_id,
    }


@pytest.mark.asyncio
async def test_process_create_projects_canonical_owner_and_department(
    client_factory,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    async with client_factory(user=test_user_cro) as client:
        response = await client.post(
            "/api/v1/processes",
            json=_payload(
                owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
        owner_lookup = await client.get(
            "/api/v1/users/lookup/process-owners",
            params={"q": test_user_employee.email},
        )
        department_lookup = await client.get(
            "/api/v1/departments/lookup/process-owners",
            params={"q": test_department.code},
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["process_owner_user_id"] == test_user_employee.id
    assert body["process_owner"]["name"] == test_user_employee.name
    assert body["process_owner"]["email"] == test_user_employee.email
    assert body["owning_department_id"] == test_department.id
    assert body["owning_department"] == {
        "name": test_department.name,
        "code": test_department.code,
    }
    assert body["ownership_status"] == "assigned"
    assert body["owner_orphaned"] is False
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


@pytest.mark.asyncio
async def test_process_rejects_inactive_owner_and_department(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    test_user_employee.is_active = False
    await db_session.commit()
    async with client_factory(user=test_user_cro) as client:
        inactive_owner = await client.post(
            "/api/v1/processes",
            json=_payload(
                owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
    assert inactive_owner.status_code == 400

    test_user_employee.is_active = True
    test_department.is_active = False
    await db_session.commit()
    async with client_factory(user=test_user_cro) as client:
        inactive_department = await client.post(
            "/api/v1/processes",
            json=_payload(
                owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
    assert inactive_department.status_code == 400


@pytest.mark.asyncio
async def test_process_owner_eligibility_accepts_active_business_user_but_never_platform_admin(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_platform_admin: User,
    test_department: Department,
):
    inactive_role = Role(
        name="inactive_process_owner_role",
        display_name="Inactive Process Owner Role",
        description="Inactive metadata must not disqualify an active owner",
        is_active=False,
    )
    inactive_home_department = Department(
        name="Inactive Owner Home",
        code="IOH",
        is_active=False,
    )
    db_session.add_all([inactive_role, inactive_home_department])
    await db_session.flush()
    eligible_owner = User(
        name="Active Owner With Inactive Metadata",
        email="inactive.metadata.owner@test.com",
        role_id=inactive_role.id,
        department_id=inactive_home_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(eligible_owner)
    await db_session.flush()
    admin_owned_process = Process(
        f_code="F-ADMIN-OWNER-GUARD",
        l0_area="Operations",
        l1_process="Platform admin ownership guard",
        process_owner_user_id=test_user_platform_admin.id,
        owning_department_id=test_department.id,
    )
    db_session.add(admin_owned_process)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        eligible_lookup = await client.get(
            "/api/v1/users/lookup/process-owners",
            params={"q": eligible_owner.email},
        )
        admin_lookup = await client.get(
            "/api/v1/users/lookup/process-owners",
            params={"q": test_user_platform_admin.email},
        )
        created = await client.post(
            "/api/v1/processes",
            json=_payload(
                owner_id=eligible_owner.id,
                department_id=test_department.id,
            ),
        )
        rejected_create = await client.post(
            "/api/v1/processes",
            json=_payload(
                owner_id=test_user_platform_admin.id,
                department_id=test_department.id,
            ),
        )
        rejected_update = await client.patch(
            f"/api/v1/processes/{created.json()['id']}",
            json={"process_owner_user_id": test_user_platform_admin.id},
        )

    assert eligible_lookup.status_code == 200, eligible_lookup.text
    assert eligible_lookup.json() == [
        {
            "id": eligible_owner.id,
            "name": eligible_owner.name,
            "email": eligible_owner.email,
            "role_name": inactive_role.name,
            "department_id": inactive_home_department.id,
            "department_name": inactive_home_department.name,
        }
    ]
    assert admin_lookup.status_code == 200, admin_lookup.text
    assert admin_lookup.json() == []
    assert created.status_code == 201, created.text
    assert rejected_create.status_code == 400, rejected_create.text
    assert rejected_update.status_code == 400, rejected_update.text

    async with client_factory(user=test_user_platform_admin) as client:
        admin_picker = await client.get("/api/v1/users/lookup/process-owners")
        admin_list = await client.get("/api/v1/processes")
        admin_detail = await client.get(
            f"/api/v1/processes/{admin_owned_process.id}"
        )

    assert admin_picker.status_code == 403, admin_picker.text
    assert admin_list.status_code == 200, admin_list.text
    assert admin_list.json()["items"] == []
    assert admin_detail.status_code == 404, admin_detail.text


@pytest.mark.asyncio
async def test_process_owner_gets_record_specific_update_without_archive(
    client_factory,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/processes",
            json=_payload(
                owner_id=test_user_employee.id,
                department_id=test_department.id,
            ),
        )
    process_id = created.json()["id"]

    async with client_factory(user=test_user_employee) as client:
        detail = await client.get(f"/api/v1/processes/{process_id}")
        updated = await client.patch(
            f"/api/v1/processes/{process_id}",
            json={"l1_process": "Owner maintained process"},
        )
        archived = await client.delete(f"/api/v1/processes/{process_id}")

    assert detail.status_code == 200
    assert detail.json()["capabilities"] == {
        "can_read": True,
        "can_update": True,
        "can_archive": False,
        "can_restore": False,
    }
    assert updated.status_code == 200, updated.text
    assert archived.status_code == 403


@pytest.mark.asyncio
async def test_process_assignment_read_redacts_unreadable_linked_context(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_department_head: User,
    test_role_department_head: Role,
    test_department: Department,
):
    owner_role = Role(
        name="process_owner_only",
        display_name="Process Owner Only",
        description="No linked-register permissions",
    )
    other_department = Department(name="Hidden Vendor Department", code="HVD")
    db_session.add_all([owner_role, other_department])
    await db_session.flush()

    process_read = await db_session.scalar(
        select(Permission).where(
            Permission.resource == "processes",
            Permission.action == "read",
        )
    )
    if process_read is None:
        process_read = Permission(
            resource="processes",
            action="read",
            description="Read ICT Register processes",
        )
        db_session.add(process_read)
        await db_session.flush()
    db_session.add(
        RolePermission(
            role_id=test_role_department_head.id,
            permission_id=process_read.id,
        )
    )

    owner = User(
        name="Assignment-only Process Owner",
        email="process.owner.only@test.com",
        role_id=owner_role.id,
        department_id=other_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()

    process = Process(
        f_code="F-LINK-SCOPE",
        l0_area="Operations",
        l1_process="Linked-context authorization",
        process_owner_user_id=owner.id,
        owning_department_id=test_department.id,
    )
    asset = Asset(name="Restricted supporting asset")
    vendor = Vendor(
        name="Restricted supporting vendor",
        process="Restricted service",
        department_id=other_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    db_session.add_all([process, asset, vendor])
    await db_session.flush()
    db_session.add_all(
        [
            ProcessAssetLink(process_id=process.id, asset_id=asset.id),
            AssetVendorLink(
                asset_id=asset.id,
                vendor_id=vendor.id,
                ict_service_code="S01",
            ),
            ProcessVendorLink(process_id=process.id, vendor_id=vendor.id),
        ]
    )
    await db_session.commit()

    async def reload_user(user_id: int) -> User:
        return (
            await db_session.execute(
                select(User)
                .options(
                    selectinload(User.role)
                    .selectinload(Role.permissions)
                    .selectinload(RolePermission.permission),
                    selectinload(User.department),
                )
                .where(User.id == user_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()

    owner = await reload_user(owner.id)
    department_head = await reload_user(test_user_department_head.id)
    global_reader = await reload_user(test_user_cro.id)

    async with client_factory(current_user=owner) as client:
        owner_response = await client.get(f"/api/v1/processes/{process.id}")
    async with client_factory(current_user=department_head) as client:
        department_head_response = await client.get(f"/api/v1/processes/{process.id}")
    async with client_factory(current_user=global_reader) as client:
        global_response = await client.get(f"/api/v1/processes/{process.id}")

    for response in (owner_response, department_head_response):
        assert response.status_code == 200, response.text
        derived = response.json()["derived"]
        assert derived["linked_asset_count"] == 0
        assert derived["linked_vendor_count"] == 0
        assert derived["transitive_vendor_links"] == []
        assert derived["inputs"]["manual_vendor_link_count"] == 0
        assert derived["inputs"]["transitive_vendor_pair_count"] == 0
        assert "Restricted supporting asset" not in response.text
        assert "Restricted supporting vendor" not in response.text

    assert global_response.status_code == 200, global_response.text
    global_derived = global_response.json()["derived"]
    assert global_derived["linked_asset_count"] == 1
    assert global_derived["linked_vendor_count"] == 2
    assert global_derived["inputs"]["manual_vendor_link_count"] == 1
    assert global_derived["inputs"]["transitive_vendor_pair_count"] == 1
    assert global_derived["transitive_vendor_links"] == [
        {
            "process_id": process.id,
            "process_name": process.l1_process,
            "process_cif": "no",
            "process_criticality": None,
            "vendor_id": vendor.id,
            "vendor_name": vendor.name,
            "via_asset_id": asset.id,
            "via_asset_name": asset.name,
        }
    ]


@pytest.mark.asyncio
async def test_process_vendor_links_apply_both_row_policies_without_name_leakage(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
):
    """Process assignment never broadens Vendor authority, and vice versa."""

    async def permission(resource: str, action: str) -> Permission:
        existing = await db_session.scalar(
            select(Permission).where(
                Permission.resource == resource,
                Permission.action == action,
            )
        )
        if existing is not None:
            return existing
        created = Permission(
            resource=resource,
            action=action,
            description=f"{resource}:{action}",
        )
        db_session.add(created)
        await db_session.flush()
        return created

    process_read = await permission("processes", "read")
    process_write = await permission("processes", "write")
    vendor_read = await permission("vendors", "read")

    owner_role = Role(
        name="process_link_owner_only",
        display_name="Process Link Owner",
        description="Record assignment plus independently scoped Vendor read",
    )
    department_head_role = Role(
        name=RoleType.DEPARTMENT_HEAD,
        display_name="Process Department Head",
        description="Department-scoped Process and Vendor reader",
    )
    unrelated_role = Role(
        name="process_link_unrelated_writer",
        display_name="Unrelated Process Writer",
        description="Broad actions constrained to its Department rows",
    )
    db_session.add_all([owner_role, department_head_role, unrelated_role])
    await db_session.flush()
    db_session.add_all(
        [
            RolePermission(role_id=owner_role.id, permission_id=vendor_read.id),
            RolePermission(role_id=department_head_role.id, permission_id=process_read.id),
            RolePermission(role_id=department_head_role.id, permission_id=vendor_read.id),
            RolePermission(role_id=unrelated_role.id, permission_id=process_read.id),
            RolePermission(role_id=unrelated_role.id, permission_id=process_write.id),
            RolePermission(role_id=unrelated_role.id, permission_id=vendor_read.id),
        ]
    )

    owning_department = Department(name="Link Owning Department", code="LOD")
    other_department = Department(name="Link Other Department", code="LXD")
    db_session.add_all([owning_department, other_department])
    await db_session.flush()
    owner = User(
        name="Cross-department Process Owner",
        email="cross.process.owner@test.com",
        role_id=owner_role.id,
        department_id=other_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    department_head = User(
        name="Owning Department Head",
        email="process.department.head@test.com",
        role_id=department_head_role.id,
        department_id=owning_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    unrelated = User(
        name="Unrelated Process Writer",
        email="unrelated.process.writer@test.com",
        role_id=unrelated_role.id,
        department_id=other_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add_all([owner, department_head, unrelated])
    await db_session.flush()

    process = Process(
        f_code="F-LINK-AUTHZ",
        l0_area="Operations",
        l1_process="Protected cross-department Process",
        process_owner_user_id=owner.id,
        owning_department_id=owning_department.id,
    )
    owning_vendor = Vendor(
        name="Owning Department Vendor",
        process="Visible only to owning Department",
        department_id=owning_department.id,
        outsourcing_owner_user_id=department_head.id,
    )
    owner_visible_vendor = Vendor(
        name="Owner Department Vendor",
        process="Visible only to Process Owner's Department",
        department_id=other_department.id,
        outsourcing_owner_user_id=unrelated.id,
    )
    owning_vendor_candidate = Vendor(
        name="Owning Department Candidate",
        process="Mutation target for Department Head",
        department_id=owning_department.id,
        outsourcing_owner_user_id=department_head.id,
    )
    owner_vendor_candidate = Vendor(
        name="Owner Department Candidate",
        process="Mutation target for Process Owner",
        department_id=other_department.id,
        outsourcing_owner_user_id=unrelated.id,
    )
    db_session.add_all(
        [
            process,
            owning_vendor,
            owner_visible_vendor,
            owning_vendor_candidate,
            owner_vendor_candidate,
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            ProcessVendorLink(process_id=process.id, vendor_id=owning_vendor.id),
            ProcessVendorLink(process_id=process.id, vendor_id=owner_visible_vendor.id),
        ]
    )
    await db_session.commit()

    async def reload_user(user_id: int) -> User:
        return (
            await db_session.execute(
                select(User)
                .options(
                    selectinload(User.role)
                    .selectinload(Role.permissions)
                    .selectinload(RolePermission.permission),
                    selectinload(User.department),
                )
                .where(User.id == user_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()

    owner = await reload_user(owner.id)
    department_head = await reload_user(department_head.id)
    unrelated = await reload_user(unrelated.id)
    global_user = await reload_user(test_user_cro.id)

    async with client_factory(current_user=owner) as client:
        process_rows = await client.get(f"/api/v1/processes/{process.id}/vendor-links")
        assert process_rows.status_code == 200, process_rows.text
        assert [row["vendor_name"] for row in process_rows.json()] == [
            owner_visible_vendor.name
        ]
        assert process_rows.json()[0]["capabilities"] == {"can_delete": True}
        vendor_rows = await client.get(
            f"/api/v1/vendors/{owner_visible_vendor.id}/process-links"
        )
        assert vendor_rows.status_code == 200, vendor_rows.text
        assert [row["process_name"] for row in vendor_rows.json()] == [process.l1_process]
        vendor_detail = await client.get(f"/api/v1/vendors/{owner_visible_vendor.id}")
        assert vendor_detail.status_code == 200, vendor_detail.text
        assert vendor_detail.json()["capabilities"]["can_manage_process_links"] is True
        assert (
            await client.get(f"/api/v1/vendors/{owning_vendor.id}/process-links")
        ).status_code == 404
        hidden_create = await client.post(
            f"/api/v1/processes/{process.id}/vendor-links",
            json={"vendor_id": owning_vendor_candidate.id},
        )
        assert hidden_create.status_code == 404
        owner_created = await client.post(
            f"/api/v1/processes/{process.id}/vendor-links",
            json={"vendor_id": owner_vendor_candidate.id},
        )
        assert owner_created.status_code == 201, owner_created.text
        assert owner_created.json()["capabilities"] == {"can_delete": True}
        assert (
            await client.delete(
                f"/api/v1/processes/{process.id}/vendor-links/{owner_created.json()['id']}"
            )
        ).status_code == 204

    async with client_factory(current_user=department_head) as client:
        assert (await client.get("/api/v1/users/lookup/process-owners")).status_code == 200
        assert (
            await client.get("/api/v1/departments/lookup/process-owners")
        ).status_code == 200
        process_rows = await client.get(f"/api/v1/processes/{process.id}/vendor-links")
        assert process_rows.status_code == 200, process_rows.text
        assert [row["vendor_name"] for row in process_rows.json()] == [owning_vendor.name]
        assert process_rows.json()[0]["capabilities"] == {"can_delete": True}
        vendor_rows = await client.get(
            f"/api/v1/vendors/{owning_vendor.id}/process-links"
        )
        assert [row["process_name"] for row in vendor_rows.json()] == [process.l1_process]
        vendor_detail = await client.get(f"/api/v1/vendors/{owning_vendor.id}")
        assert vendor_detail.status_code == 200, vendor_detail.text
        assert vendor_detail.json()["capabilities"]["can_manage_process_links"] is True
        created = await client.post(
            f"/api/v1/processes/{process.id}/vendor-links",
            json={"vendor_id": owning_vendor_candidate.id},
        )
        assert created.status_code == 201, created.text
        assert (
            await client.delete(
                f"/api/v1/processes/{process.id}/vendor-links/{created.json()['id']}"
            )
        ).status_code == 204

    async with client_factory(current_user=unrelated) as client:
        hidden_process_rows = await client.get(
            f"/api/v1/processes/{process.id}/vendor-links"
        )
        assert hidden_process_rows.status_code == 404
        hidden_vendor_rows = await client.get(
            f"/api/v1/vendors/{owner_visible_vendor.id}/process-links"
        )
        assert hidden_vendor_rows.status_code == 200
        assert hidden_vendor_rows.json() == []
        assert process.l1_process not in hidden_vendor_rows.text
        vendor_detail = await client.get(f"/api/v1/vendors/{owner_visible_vendor.id}")
        assert vendor_detail.status_code == 200, vendor_detail.text
        assert vendor_detail.json()["capabilities"]["can_manage_process_links"] is False
        assert (
            await client.post(
                f"/api/v1/processes/{process.id}/vendor-links",
                json={"vendor_id": owner_vendor_candidate.id},
            )
        ).status_code == 404

    async with client_factory(current_user=global_user) as client:
        process_rows = await client.get(f"/api/v1/processes/{process.id}/vendor-links")
        assert {row["vendor_name"] for row in process_rows.json()} == {
            owning_vendor.name,
            owner_visible_vendor.name,
        }
        vendor_rows = await client.get(
            f"/api/v1/vendors/{owning_vendor.id}/process-links"
        )
        assert [row["process_name"] for row in vendor_rows.json()] == [process.l1_process]
        vendor_detail = await client.get(f"/api/v1/vendors/{owning_vendor.id}")
        assert vendor_detail.status_code == 200, vendor_detail.text
        assert vendor_detail.json()["capabilities"]["can_manage_process_links"] is True
        created = await client.post(
            f"/api/v1/processes/{process.id}/vendor-links",
            json={"vendor_id": owning_vendor_candidate.id},
        )
        assert created.status_code == 201, created.text
        assert (
            await client.delete(
                f"/api/v1/processes/{process.id}/vendor-links/{created.json()['id']}"
            )
        ).status_code == 204


@pytest.mark.asyncio
async def test_process_assignment_lookup_denies_unrelated_read_only_user(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
):
    process_read = await db_session.scalar(
        select(Permission).where(
            Permission.resource == "processes",
            Permission.action == "read",
        )
    )
    if process_read is None:
        process_read = Permission(
            resource="processes",
            action="read",
            description="Read ICT Register processes",
        )
        db_session.add(process_read)
        await db_session.flush()

    read_only_role = Role(
        name="process_lookup_read_only",
        display_name="Process Lookup Read Only",
        description="Can read Department Processes but cannot assign owners",
    )
    owner_role = Role(
        name="process_lookup_owner",
        display_name="Process Lookup Owner",
        description="Assignment-only Process owner",
    )
    db_session.add_all([read_only_role, owner_role])
    await db_session.flush()
    db_session.add(
        RolePermission(role_id=read_only_role.id, permission_id=process_read.id)
    )
    read_only_user = User(
        name="Unrelated Process Reader",
        email="unrelated.process.reader@test.com",
        role_id=read_only_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    process_owner = User(
        name="Purpose-scoped Process Owner",
        email="purpose.process.owner@test.com",
        role_id=owner_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add_all([read_only_user, process_owner])
    await db_session.flush()
    process = Process(
        f_code="F-LOOKUP-AUTHZ",
        l0_area="Operations",
        l1_process="Purpose-scoped assignment lookup",
        process_owner_user_id=process_owner.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()

    async def reload_user(user_id: int) -> User:
        return (
            await db_session.execute(
                select(User)
                .options(
                    selectinload(User.role)
                    .selectinload(Role.permissions)
                    .selectinload(RolePermission.permission),
                    selectinload(User.department),
                )
                .where(User.id == user_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()

    read_only_user = await reload_user(read_only_user.id)
    process_owner = await reload_user(process_owner.id)
    global_writer = await reload_user(test_user_cro.id)

    async with client_factory(current_user=read_only_user) as client:
        assert (await client.get("/api/v1/users/lookup/process-owners")).status_code == 403
        assert (
            await client.get("/api/v1/departments/lookup/process-owners")
        ).status_code == 403

    for eligible_user in (process_owner, global_writer):
        async with client_factory(current_user=eligible_user) as client:
            assert (
                await client.get(
                    "/api/v1/users/lookup/process-owners",
                    params={"q": process_owner.email},
                )
            ).status_code == 200
            assert (
                await client.get("/api/v1/departments/lookup/process-owners")
            ).status_code == 200


@pytest.mark.asyncio
async def test_pending_process_orphan_blocks_vendor_link_create_and_delete(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    process = Process(
        f_code="F-ORPHAN-LINK",
        l0_area="Operations",
        l1_process="Orphan-locked links",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    linked_vendor = Vendor(
        name="Existing orphan-locked Vendor",
        process="Existing Process dependency",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    candidate_vendor = Vendor(
        name="Candidate orphan-locked Vendor",
        process="Proposed Process dependency",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    db_session.add_all([process, linked_vendor, candidate_vendor])
    await db_session.flush()
    link = ProcessVendorLink(process_id=process.id, vendor_id=linked_vendor.id)
    db_session.add(link)
    await db_session.commit()

    await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        process_end_rows = await client.get(
            f"/api/v1/processes/{process.id}/vendor-links"
        )
        vendor_end_rows = await client.get(
            f"/api/v1/vendors/{linked_vendor.id}/process-links"
        )
        created = await client.post(
            f"/api/v1/processes/{process.id}/vendor-links",
            json={"vendor_id": candidate_vendor.id},
        )
        removed = await client.delete(
            f"/api/v1/processes/{process.id}/vendor-links/{link.id}"
        )
        pending_only_vendor = await client.get(
            f"/api/v1/vendors/{linked_vendor.id}"
        )

    assert process_end_rows.status_code == 200, process_end_rows.text
    assert vendor_end_rows.status_code == 200, vendor_end_rows.text
    assert process_end_rows.json()[0]["capabilities"] == {"can_delete": False}
    assert vendor_end_rows.json()[0]["capabilities"] == {"can_delete": False}
    assert created.status_code == 409, created.text
    assert removed.status_code == 409, removed.text
    assert "governance workflow" in created.json()["detail"]
    assert "governance workflow" in removed.json()["detail"]
    assert pending_only_vendor.status_code == 200, pending_only_vendor.text
    assert (
        pending_only_vendor.json()["capabilities"]["can_manage_process_links"]
        is False
    )

    db_session.add(
        Process(
            f_code="F-EDITABLE-LINK",
            l0_area="Operations",
            l1_process="Editable links",
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
    )
    await db_session.commit()
    async with client_factory(user=test_user_cro) as client:
        mixed_vendor = await client.get(f"/api/v1/vendors/{linked_vendor.id}")
    assert mixed_vendor.status_code == 200, mixed_vendor.text
    assert mixed_vendor.json()["capabilities"]["can_manage_process_links"] is True

@pytest.mark.asyncio
async def test_process_deactivation_preserves_fk_and_governance_reassigns(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
    test_department: Department,
):
    process = Process(
        f_code="F-OWN-1",
        l0_area="Operations",
        l1_process="Ownership governance",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()

    test_user_employee.is_active = False
    created = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    process_orphan = next(item for item in created if item.item_type == "process")

    await db_session.refresh(process)
    assert process.process_owner_user_id == test_user_employee.id
    assert (
        await db_session.scalar(
            select(OrphanedItem.id).where(
                OrphanedItem.item_type == "process",
                OrphanedItem.item_id == process.id,
                OrphanedItem.status == "pending",
            )
        )
        is not None
    )

    with pytest.raises(
        ConflictError,
        match="must be reassigned through the governance workflow",
    ):
        await update_process_detail(
            db=db_session,
            process_id=process.id,
            payload=ProcessUpdate(l1_process="Forbidden direct orphan update"),
            current_user=test_user_employee,
        )

    resolved = await resolve_orphan(
        db_session,
        orphan_id=process_orphan.id,
        resolved_by_id=test_user_cro.id,
        new_owner_id=test_user_cro.id,
        department_id=test_department.id,
    )
    await db_session.refresh(process)
    assert resolved.status == "resolved"
    assert process.process_owner_user_id == test_user_cro.id
    assert process.owning_department_id == test_department.id


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_process_create_and_owner_deactivation_preserve_invariant(
    async_engine,
    client_factory,
    test_user: User,
    test_user_employee: User,
    test_department: Department,
):
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL transaction-scoped advisory locks")

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
        user=test_user,
        settings=Settings(mock_auth_enabled=True, debug=True),
        db_override=override_get_db,
    ) as client:
        created, deactivated = await asyncio.gather(
            client.post(
                "/api/v1/processes",
                json=_payload(
                    owner_id=test_user_employee.id,
                    department_id=test_department.id,
                ),
            ),
            client.patch(
                f"/api/v1/users/{test_user_employee.id}",
                json={"is_active": False},
            ),
        )

    assert deactivated.status_code == 200, deactivated.text
    assert created.status_code in {201, 400}, created.text
    async with session_maker() as session:
        owner = await session.get(User, test_user_employee.id)
        process = (
            await session.execute(
                select(Process).where(Process.l1_process == "Claims handling")
            )
        ).scalar_one_or_none()
        assert owner is not None and owner.is_active is False
        if process is None:
            assert created.status_code == 400
        else:
            assert created.status_code == 201
            pending_orphan = (
                await session.execute(
                    select(OrphanedItem).where(
                        OrphanedItem.item_type == "process",
                        OrphanedItem.item_id == process.id,
                        OrphanedItem.previous_owner_id == test_user_employee.id,
                        OrphanedItem.status == "pending",
                    )
                )
            ).scalar_one()
            assert pending_orphan.item_id == process.id


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_process_update_vs_deactivation_is_serialized(
    async_engine,
    db_session: AsyncSession,
    client_factory,
    test_user: User,
    test_user_employee: User,
    test_department: Department,
):
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL transaction-scoped advisory locks")

    process = Process(
        f_code="F-PG-UPD-DEACT",
        l0_area="Operations",
        l1_process="Update versus deactivation",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()

    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

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
                        f"/api/v1/processes/{process.id}",
                        json={"l1_process": "Serialized owner update"},
                    ),
                    admin_client.patch(
                        f"/api/v1/users/{test_user_employee.id}",
                        json={"is_active": False},
                    ),
                ),
                timeout=10,
            )

    assert deactivated.status_code == 200, deactivated.text
    assert updated.status_code in {200, 409}, updated.text
    async with session_maker() as session:
        owner = await session.get(User, test_user_employee.id)
        persisted = await session.get(Process, process.id)
        pending = await session.scalar(
            select(OrphanedItem.id).where(
                OrphanedItem.item_type == "process",
                OrphanedItem.item_id == process.id,
                OrphanedItem.previous_owner_id == test_user_employee.id,
                OrphanedItem.status == "pending",
            )
        )
        assert owner is not None and owner.is_active is False
        assert persisted is not None and persisted.process_owner_user_id == test_user_employee.id
        assert pending is not None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_process_vendor_link_vs_deactivation_is_serialized(
    async_engine,
    db_session: AsyncSession,
    client_factory,
    test_user: User,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL transaction-scoped advisory locks")

    process = Process(
        f_code="F-PG-LINK-DEACT",
        l0_area="Operations",
        l1_process="Link versus deactivation",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    vendor = Vendor(
        name="Concurrent Process Vendor",
        process="Concurrent dependency",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    db_session.add_all([process, vendor])
    await db_session.commit()

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
            linked, deactivated = await asyncio.wait_for(
                asyncio.gather(
                    owner_client.post(
                        f"/api/v1/processes/{process.id}/vendor-links",
                        json={"vendor_id": vendor.id},
                    ),
                    admin_client.patch(
                        f"/api/v1/users/{test_user_employee.id}",
                        json={"is_active": False},
                    ),
                ),
                timeout=10,
            )

    assert deactivated.status_code == 200, deactivated.text
    assert linked.status_code in {201, 409}, linked.text
    async with session_maker() as session:
        owner = await session.get(User, test_user_employee.id)
        pending = await session.scalar(
            select(OrphanedItem.id).where(
                OrphanedItem.item_type == "process",
                OrphanedItem.item_id == process.id,
                OrphanedItem.previous_owner_id == test_user_employee.id,
                OrphanedItem.status == "pending",
            )
        )
        persisted_link = await session.scalar(
            select(ProcessVendorLink.id).where(
                ProcessVendorLink.process_id == process.id,
                ProcessVendorLink.vendor_id == vendor.id,
            )
        )
        assert owner is not None and owner.is_active is False
        assert pending is not None
        assert (persisted_link is not None) is (linked.status_code == 201)


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_process_update_vs_governance_resolution_is_serialized(
    async_engine,
    db_session: AsyncSession,
    client_factory,
    test_user: User,
    test_user_cro: User,
    test_department: Department,
):
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL transaction-scoped advisory locks")

    process = Process(
        f_code="F-PG-UPD-RESOLVE",
        l0_area="Operations",
        l1_process="Update versus resolution",
        process_owner_user_id=test_user.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()
    created = await flag_orphaned_items(db_session, test_user.id)
    await db_session.commit()
    orphan = next(item for item in created if item.item_type == "process")

    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    async def resolve_in_separate_session() -> None:
        async with session_maker() as session:
            await resolve_orphan(
                session,
                orphan_id=orphan.id,
                resolved_by_id=test_user_cro.id,
                new_owner_id=test_user_cro.id,
                department_id=test_department.id,
            )

    async with client_factory(
        user=test_user,
        settings=Settings(mock_auth_enabled=True, debug=True),
        db_override=override_get_db,
    ) as owner_client:
        updated, _ = await asyncio.wait_for(
            asyncio.gather(
                owner_client.patch(
                    f"/api/v1/processes/{process.id}",
                    json={"l1_process": "Forbidden racing update"},
                ),
                resolve_in_separate_session(),
            ),
            timeout=10,
        )

    # A globally authorized writer may run after resolution and update a
    # non-ownership field; every serialized outcome must preserve reassignment.
    assert updated.status_code in {200, 404, 409}, updated.text
    async with session_maker() as session:
        persisted = await session.get(Process, process.id)
        resolved = await session.get(OrphanedItem, orphan.id)
        assert persisted is not None and persisted.process_owner_user_id == test_user_cro.id
        assert resolved is not None and resolved.status == "resolved"
        assert resolved.new_owner_id == test_user_cro.id
