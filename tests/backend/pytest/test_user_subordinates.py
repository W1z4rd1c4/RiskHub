"""Organization rosters share Access's Admin-row boundary, not picker policy."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_manage_users, has_permission
from app.models import Department, User
from app.models.user import AccessScope


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_kind", ["self", "cro", "admin"])
@pytest.mark.parametrize("scope", [AccessScope.DEPARTMENT, AccessScope.MANAGER])
async def test_subordinates_filter_admin_rows_without_narrowing_direct_reports(
    db_session: AsyncSession,
    client_factory,
    test_user_employee: User,
    test_user_cro: User,
    test_user_platform_admin: User,
    actor_kind: str,
    scope: AccessScope,
):
    manager = test_user_employee
    manager.access_scope = scope
    test_user_platform_admin.manager_id = manager.id
    other_department = Department(name="Other report department", code="REPORTS-OTHER")
    db_session.add(other_department)
    await db_session.flush()
    report = User(
        name="Cross-department report",
        email="cross-report@example.com",
        role_id=manager.role_id,
        department_id=other_department.id,
        manager_id=manager.id,
        is_active=True,
    )
    inactive_report = User(
        name="Inactive report",
        email="inactive-report@example.com",
        role_id=manager.role_id,
        manager_id=manager.id,
        is_active=False,
    )
    db_session.add_all([report, inactive_report])
    await db_session.flush()
    indirect_report = User(
        name="Indirect report",
        email="indirect-report@example.com",
        role_id=manager.role_id,
        manager_id=report.id,
        is_active=True,
    )
    db_session.add(indirect_report)
    await db_session.commit()

    actor = {"self": manager, "cro": test_user_cro, "admin": test_user_platform_admin}[actor_kind]
    assert not can_manage_users(manager)
    assert not has_permission(manager, "users", "read")
    async with client_factory(current_user=actor) as client:
        response = await client.get(f"/api/v1/users/{manager.id}/subordinates")

    assert response.status_code == 200, response.text
    expected_ids = {report.id, inactive_report.id}
    if actor_kind == "admin":
        expected_ids.add(test_user_platform_admin.id)
    assert {row["id"] for row in response.json()} == expected_ids
    assert all(row["manager_id"] == manager.id for row in response.json())


@pytest.mark.asyncio
async def test_platform_admin_self_lookup_retains_admin_reports(
    db_session: AsyncSession,
    client_factory,
    test_user_platform_admin: User,
):
    report = User(
        name="Admin report",
        email="admin-report@example.com",
        role_id=test_user_platform_admin.role_id,
        department_id=test_user_platform_admin.department_id,
        manager_id=test_user_platform_admin.id,
        is_active=True,
    )
    db_session.add(report)
    await db_session.commit()
    async with client_factory(current_user=test_user_platform_admin) as client:
        response = await client.get(f"/api/v1/users/{test_user_platform_admin.id}/subordinates")
        department = await client.get("/api/v1/access/users/my-department")
    assert response.status_code == 200, response.text
    assert [row["id"] for row in response.json()] == [report.id]
    assert department.status_code == 200, department.text
    assert {row["id"] for row in department.json()} == {test_user_platform_admin.id, report.id}


@pytest.mark.asyncio
async def test_self_lookup_with_no_reports_returns_empty_list(client_factory, test_user_employee: User):
    async with client_factory(current_user=test_user_employee) as client:
        response = await client.get(f"/api/v1/users/{test_user_employee.id}/subordinates")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_subordinates_preserve_authorization_and_missing_target_responses(
    client_factory,
    test_user_employee: User,
    test_user_cro: User,
):
    async with client_factory(current_user=test_user_employee) as client:
        for target_id in (test_user_cro.id, 999999):
            response = await client.get(f"/api/v1/users/{target_id}/subordinates")
            assert response.status_code == 403
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/users/999999/subordinates")
        assert response.status_code == 404
        assert response.json()["detail"] == "User not found"


@pytest.mark.asyncio
async def test_roster_filter_does_not_change_permissioned_generic_directory_discovery(
    client_factory,
    test_user_cro: User,
    test_user_platform_admin: User,
):
    async with client_factory(current_user=test_user_cro) as client:
        lookup = await client.get("/api/v1/users/lookup", params={"ids": test_user_platform_admin.id})
        directory = await client.get("/api/v1/users/directory", params={"role_name": "admin"})
        access = await client.get("/api/v1/access/users")
        department = await client.get(
            "/api/v1/access/users/my-department",
            params={"department_id": test_user_platform_admin.department_id},
        )
    assert lookup.status_code == directory.status_code == access.status_code == department.status_code == 200
    assert [row["id"] for row in lookup.json()] == [test_user_platform_admin.id]
    assert [row["id"] for row in directory.json()["items"]] == [test_user_platform_admin.id]
    assert "admin" in {role["name"] for role in directory.json()["available_roles"]}
    for response in (access, department):
        assert test_user_platform_admin.id not in {row["id"] for row in response.json()}
