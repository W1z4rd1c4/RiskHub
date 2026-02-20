import pytest
from httpx import AsyncClient

from app.models import User


@pytest.mark.asyncio
async def test_access_users_requires_privileged(client_employee: AsyncClient):
    response = await client_employee.get("/api/v1/access/users")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_access_users_list_privileged(client_risk_manager: AsyncClient):
    response = await client_risk_manager.get("/api/v1/access/users")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_access_update_allows_admin(auth_client: AsyncClient, test_user_employee: User, test_role):
    response = await auth_client.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"role_id": test_role.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"]["name"] == "admin"


@pytest.mark.asyncio
async def test_access_update_rejects_non_admin_scope_change(
    client_risk_manager: AsyncClient,
    test_user_employee: User,
):
    response = await client_risk_manager.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"access_scope": "global"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_access_update_rejects_non_admin_department_change(
    client_risk_manager: AsyncClient,
    test_user_employee: User,
):
    response = await client_risk_manager.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"department_id": None},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_access_update_rejects_non_admin_manager_change(
    client_risk_manager: AsyncClient,
    test_user_employee: User,
    test_user: User,
):
    response = await client_risk_manager.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"manager_id": test_user.id},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_access_update_rejects_non_admin_mixed_mutation_payload(
    client_risk_manager: AsyncClient,
    test_user_employee: User,
    test_user: User,
):
    response = await client_risk_manager.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"department_id": None, "manager_id": test_user.id},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_access_update_allows_admin_manager_change(
    auth_client: AsyncClient,
    test_user_employee: User,
    test_user: User,
):
    response = await auth_client.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"manager_id": test_user.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["manager_id"] == test_user.id


@pytest.mark.asyncio
async def test_access_prevents_self_demotion(auth_client: AsyncClient, test_user: User):
    response = await auth_client.patch(
        f"/api/v1/access/users/{test_user.id}",
        json={"access_scope": "department"},
    )
    assert response.status_code == 400
