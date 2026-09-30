"""The legacy user PATCH must not bypass the Admin/CRO field boundary."""

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.core.config import Settings
from app.models import ActivityLog, Department, User
from app.models.user import AccessScope


@pytest.fixture(params=["hybrid_dev", "microsoft_sso", "native"])
def identity_settings(request):
    native = request.param == "native"
    return Settings(
        _env_file=None,
        debug=True,
        mock_auth_enabled=False,
        auth_mode="password" if native else request.param,
        directory_provider="none" if native else "graph",
    )


@pytest.fixture(params=["/api/v1/users", "/api/v1/access/users"])
def user_update_path(request):
    return request.param


@pytest_asyncio.fixture
async def backup_admin(db_session, test_user_platform_admin):
    admin = User(
        name="Independent platform administrator",
        email="backup-admin@example.com",
        role_id=test_user_platform_admin.role_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
        local_enrollment_state="enrolled",
    )
    db_session.add(admin)
    await db_session.commit()
    return admin


@pytest.mark.asyncio
@pytest.mark.parametrize("target_self", [True, False], ids=["self", "other-user"])
async def test_admin_cannot_assign_business_role_through_either_patch(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    target_self,
    test_user_platform_admin,
    test_user_employee,
    test_role_cro,
    backup_admin,
):
    actor = test_user_platform_admin
    target = actor if target_self else test_user_employee
    before = (target.role_id, target.name, target.token_version)
    audit_count = await db_session.scalar(select(func.count()).select_from(ActivityLog))
    async with client_factory(current_user=actor, settings=identity_settings) as client:
        assert (await client.get("/api/v1/risks")).status_code == 403
        response = await client.patch(
            f"{user_update_path}/{target.id}",
            json={"role_id": test_role_cro.id, "name": "Must not be saved"},
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Only CRO can assign business roles"
        assert (await client.get("/api/v1/risks")).status_code == 403
    await db_session.refresh(target)
    assert (target.role_id, target.name, target.token_version) == before
    assert (
        await db_session.scalar(select(func.count()).select_from(ActivityLog))
        == audit_count
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["department_id", "manager_id"])
async def test_admin_cannot_clear_business_assignments_in_mixed_patch(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    field,
    test_user_platform_admin,
    test_user_employee,
):
    test_user_employee.manager_id = test_user_platform_admin.id
    await db_session.commit()
    before = (
        test_user_employee.name,
        test_user_employee.department_id,
        test_user_employee.manager_id,
        test_user_employee.token_version,
    )
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={"name": "Must not be saved", field: None},
        )
    assert response.status_code == 403
    assert (
        response.json()["detail"] == "Only CRO can update user business access fields"
    )
    await db_session.refresh(test_user_employee)
    assert (
        test_user_employee.name,
        test_user_employee.department_id,
        test_user_employee.manager_id,
        test_user_employee.token_version,
    ) == before


@pytest.mark.asyncio
async def test_admin_cannot_widen_business_scope_through_either_patch(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    test_user_platform_admin,
    test_user_employee,
):
    version = test_user_employee.token_version
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={"access_scope": "global"},
        )
    # The legacy UserUpdate schema does not expose access_scope and ignores it.
    assert response.status_code == (200 if user_update_path == "/api/v1/users" else 403)
    await db_session.refresh(test_user_employee)
    assert test_user_employee.access_scope == AccessScope.DEPARTMENT
    assert test_user_employee.token_version == version


@pytest.mark.asyncio
async def test_admin_can_edit_identity_and_assign_admin_through_either_patch(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    test_user_platform_admin,
    test_user_employee,
):
    version = test_user_employee.token_version
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={
                "name": "Updated identity",
                "role_id": test_user_platform_admin.role_id,
            },
        )
    assert response.status_code == 200
    assert response.json()["role"]["name"] == "admin"
    await db_session.refresh(test_user_employee)
    assert test_user_employee.name == "Updated identity"
    assert test_user_employee.token_version == version + 1


@pytest.mark.asyncio
async def test_admin_can_keep_unchanged_business_role_while_editing_identity(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    test_user_platform_admin,
    test_user_employee,
):
    version = test_user_employee.token_version
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={"name": "Updated identity", "role_id": test_user_employee.role_id},
        )
    assert response.status_code == 200
    await db_session.refresh(test_user_employee)
    assert test_user_employee.name == "Updated identity"
    assert test_user_employee.token_version == version


@pytest.mark.asyncio
async def test_last_effective_admin_cannot_be_deactivated_through_either_patch(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    test_user_platform_admin,
):
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_platform_admin.id}",
            json={"is_active": False},
        )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "LAST_PLATFORM_ADMIN"
    await db_session.refresh(test_user_platform_admin)
    assert test_user_platform_admin.is_active
    assert not test_user_platform_admin.local_suspended


@pytest.mark.asyncio
async def test_admin_can_deactivate_another_user_through_either_patch(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    test_user_platform_admin,
    test_user_employee,
):
    version = test_user_employee.token_version
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={"is_active": False},
        )
    assert response.status_code == 200
    await db_session.refresh(test_user_employee)
    assert not test_user_employee.is_active
    assert test_user_employee.local_suspended
    assert test_user_employee.token_version == version + 1


@pytest.mark.asyncio
async def test_cro_business_update_stays_on_access_surface(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    test_user_cro,
    test_user_employee,
    test_role_department_head,
):
    department = Department(name="Business destination", code="BOUNDARY")
    db_session.add(department)
    await db_session.commit()
    version = test_user_employee.token_version
    async with client_factory(
        current_user=test_user_cro, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={
                "role_id": test_role_department_head.id,
                "department_id": department.id,
                "manager_id": test_user_cro.id,
                "access_scope": "global",
            },
        )
    if user_update_path == "/api/v1/users":
        assert response.status_code == 403
        assert response.json()["detail"] == "Only Admin can manage user lifecycle"
        await db_session.refresh(test_user_employee)
        assert test_user_employee.token_version == version
    else:
        assert response.status_code == 200
        await db_session.refresh(test_user_employee)
        assert test_user_employee.role_id == test_role_department_head.id
        assert test_user_employee.department_id == department.id
        assert test_user_employee.manager_id == test_user_cro.id
        assert test_user_employee.access_scope == AccessScope.GLOBAL
        assert test_user_employee.token_version == version + 1


@pytest.mark.asyncio
@pytest.mark.parametrize("admin_target", [False, True])
async def test_cro_cannot_assign_admin_or_edit_admin_target(
    client_factory,
    identity_settings,
    user_update_path,
    admin_target,
    test_user_cro,
    test_user_employee,
    test_user_platform_admin,
):
    target = test_user_platform_admin if admin_target else test_user_employee
    async with client_factory(
        current_user=test_user_cro, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{target.id}",
            json={"role_id": test_user_platform_admin.role_id},
        )
    expected = (
        404 if admin_target and user_update_path == "/api/v1/access/users" else 403
    )
    assert response.status_code == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["name", "email"])
async def test_sso_directory_identity_remains_read_only(
    client_factory,
    db_session,
    user_update_path,
    field,
    test_user_platform_admin,
    test_user_employee,
):
    test_user_employee.external_id = "synthetic-directory-id"
    await db_session.commit()
    before = (
        test_user_employee.name,
        test_user_employee.email,
        test_user_employee.token_version,
    )
    settings = Settings(_env_file=None, debug=True, auth_mode="microsoft_sso")
    async with client_factory(
        current_user=test_user_platform_admin, settings=settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={field: "Changed name" if field == "name" else "changed@example.com"},
        )
    assert response.status_code == 403
    assert "managed by directory sync" in response.json()["detail"]
    await db_session.refresh(test_user_employee)
    assert (
        test_user_employee.name,
        test_user_employee.email,
        test_user_employee.token_version,
    ) == before


@pytest.mark.asyncio
async def test_native_email_remains_on_verified_workflow(
    client_factory,
    user_update_path,
    test_user_platform_admin,
    test_user_employee,
):
    settings = Settings(
        _env_file=None, debug=True, auth_mode="password", directory_provider="none"
    )
    async with client_factory(
        current_user=test_user_platform_admin, settings=settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={"email": "changed@example.com"},
        )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "LOCAL_CREDENTIAL_WORKFLOW_REQUIRED"


@pytest.mark.asyncio
async def test_admin_cannot_deactivate_self_even_with_backup_admin(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    test_user_platform_admin,
    backup_admin,
):
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_platform_admin.id}",
            json={"is_active": False},
        )
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot deactivate your own privileged access"
    await db_session.refresh(test_user_platform_admin)
    assert test_user_platform_admin.is_active


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", [AccessScope.DEPARTMENT, AccessScope.MANAGER])
async def test_non_global_admin_cannot_assign_business_role(
    client_factory,
    db_session,
    identity_settings,
    user_update_path,
    scope,
    test_user_platform_admin,
    test_user_employee,
    test_role_cro,
):
    test_user_platform_admin.access_scope = scope
    await db_session.commit()
    role_id = test_user_employee.role_id
    async with client_factory(
        current_user=test_user_platform_admin, settings=identity_settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={"role_id": test_role_cro.id},
        )
    assert response.status_code == 403
    await db_session.refresh(test_user_employee)
    assert test_user_employee.role_id == role_id


@pytest.mark.asyncio
async def test_admin_cannot_assign_business_role_to_sso_linked_user(
    client_factory,
    db_session,
    user_update_path,
    test_user_platform_admin,
    test_user_employee,
    test_role_cro,
):
    test_user_employee.external_id = "synthetic-directory-id"
    await db_session.commit()
    settings = Settings(_env_file=None, debug=True, auth_mode="microsoft_sso")
    async with client_factory(
        current_user=test_user_platform_admin, settings=settings
    ) as client:
        response = await client.patch(
            f"{user_update_path}/{test_user_employee.id}",
            json={"role_id": test_role_cro.id},
        )
    assert response.status_code == 403
    assert response.json()["detail"] == "Only CRO can assign business roles"
