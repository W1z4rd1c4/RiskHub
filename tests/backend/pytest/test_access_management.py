import pytest
from httpx import AsyncClient
from sqlalchemy import select

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


@pytest.mark.asyncio
async def test_access_update_allows_admin_identity_only(
    auth_client: AsyncClient,
    test_user_employee: User,
):
    response = await auth_client.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={
            "name": "Updated Employee",
            "email": "updated.employee@example.com",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Employee"
    assert data["email"] == "updated.employee@example.com"


@pytest.mark.asyncio
async def test_access_update_allows_admin_combined_identity_and_access(
    auth_client: AsyncClient,
    test_user_employee: User,
    test_role,
):
    response = await auth_client.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={
            "name": "Combined Update",
            "email": "combined.update@example.com",
            "role_id": test_role.id,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Combined Update"
    assert data["email"] == "combined.update@example.com"
    assert data["role"]["name"] == "admin"


@pytest.mark.asyncio
async def test_access_update_rejects_cro_identity_mutation(
    client_cro: AsyncClient,
    test_user_employee: User,
):
    response = await client_cro.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"email": "cro.identity@example.com"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only Admin can update user identity fields"


@pytest.mark.asyncio
async def test_access_update_allows_cro_access_only_mutation(
    client_cro: AsyncClient,
    test_user_employee: User,
):
    response = await client_cro.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={"department_id": None},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["department_id"] is None


@pytest.mark.asyncio
async def test_access_update_duplicate_email_rolls_back_access_changes(
    auth_client: AsyncClient,
    db_session,
    test_user_employee: User,
    test_role,
):
    conflict_user = User(
        email="conflict@example.com",
        hashed_password="hash",
        name="Conflict User",
        role_id=test_user_employee.role_id,
        department_id=test_user_employee.department_id,
        is_active=True,
    )
    db_session.add(conflict_user)
    await db_session.commit()

    original_role_id = test_user_employee.role_id
    original_name = test_user_employee.name
    original_email = test_user_employee.email

    response = await auth_client.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={
            "name": "Should Roll Back",
            "email": "Conflict@Example.com",
            "role_id": test_role.id,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"

    await db_session.refresh(test_user_employee)
    assert test_user_employee.role_id == original_role_id
    assert test_user_employee.name == original_name
    assert test_user_employee.email == original_email


@pytest.mark.asyncio
async def test_access_update_logs_combined_user_changes(
    auth_client: AsyncClient,
    db_session,
    test_user_employee: User,
):
    response = await auth_client.patch(
        f"/api/v1/access/users/{test_user_employee.id}",
        json={
            "name": "Logged Employee",
            "department_id": None,
        },
    )

    assert response.status_code == 200

    from app.models.activity_log import ActivityAction, ActivityEntityType, ActivityLog

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.USER.value,
            ActivityLog.entity_id == test_user_employee.id,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes["name"]["new"] == "Logged Employee"
    assert entry.changes["department_id"]["new"] is None
