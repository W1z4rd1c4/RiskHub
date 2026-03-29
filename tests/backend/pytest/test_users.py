import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core import security
from app.core.config import Settings, get_settings
from app.core.security import verify_password
from app.db.session import get_db
from app.main import app
from app.models import User


@pytest_asyncio.fixture
async def auth_client_sso(db_session: AsyncSession, test_user: User):
    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return test_user

    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True, auth_mode="microsoft_sso")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[deps.get_current_user] = override_get_current_user
    app.dependency_overrides[security.get_current_user] = override_get_current_user
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_users(auth_client: AsyncClient, test_user: User):
    """Test listing users."""
    response = await auth_client.get("/api/v1/users")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # At least the test_user should be there
    assert len(data) >= 1
    assert any(u["email"] == test_user.email for u in data)


@pytest.mark.asyncio
async def test_list_directory_users_for_global_directory_reader(
    client_risk_manager: AsyncClient,
    test_user_employee: User,
):
    response = await client_risk_manager.get("/api/v1/users/directory")
    assert response.status_code == 200
    payload = response.json()
    assert payload["skip"] == 0
    assert payload["limit"] == 50
    assert payload["total"] >= 1
    assert any(item["email"] == test_user_employee.email for item in payload["items"])


@pytest.mark.asyncio
async def test_list_directory_users_requires_users_read(client_employee: AsyncClient):
    response = await client_employee.get("/api/v1/users/directory")
    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


@pytest.mark.asyncio
async def test_get_user(auth_client: AsyncClient, test_user: User):
    """Test getting a single user."""
    response = await auth_client.get(f"/api/v1/users/{test_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_user.email
    assert data["id"] == test_user.id


@pytest.mark.asyncio
async def test_update_user_fields(auth_client: AsyncClient, test_user: User):
    """Test updating user fields (PATCH)."""
    update_data = {"name": "Updated Name"}
    response = await auth_client.patch(f"/api/v1/users/{test_user.id}", json=update_data)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    # Email should remain unchanged
    assert data["email"] == test_user.email


@pytest.mark.asyncio
async def test_create_user_rejected_in_microsoft_sso_mode(auth_client_sso: AsyncClient, test_user: User):
    response = await auth_client_sso.post(
        "/api/v1/users",
        json={
            "email": "new.user@example.com",
            "name": "New User",
            "password": "StrongPass123!",
            "role_id": test_user.role_id,
            "department_id": None,
            "manager_id": None,
            "is_active": True,
        },
    )
    assert response.status_code == 403
    assert "directory/users/{oid}/import" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_user_requires_platform_admin(client_cro: AsyncClient, test_user: User):
    response = await client_cro.post(
        "/api/v1/users",
        json={
            "email": "new.user@example.com",
            "name": "New User",
            "password": "StrongPass123!",
            "role_id": test_user.role_id,
            "department_id": None,
            "manager_id": None,
            "is_active": True,
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Only Admin can manage user lifecycle"


@pytest.mark.asyncio
async def test_update_user_password(auth_client: AsyncClient, test_user: User, db_session: AsyncSession):
    """Test updating user password hashes correctly."""
    new_password = "new_secure_password"
    update_data = {"password": new_password}

    response = await auth_client.patch(f"/api/v1/users/{test_user.id}", json=update_data)
    assert response.status_code == 200

    # Verify in DB
    await db_session.refresh(test_user)
    assert verify_password(new_password, test_user.hashed_password)
    # Ensure it's not stored as plain text
    assert test_user.hashed_password != new_password


@pytest.mark.asyncio
async def test_update_user_password_rejected_in_microsoft_sso_mode(
    auth_client_sso: AsyncClient,
    test_user: User,
    db_session: AsyncSession,
):
    old_hash = test_user.hashed_password
    response = await auth_client_sso.patch(f"/api/v1/users/{test_user.id}", json={"password": "another-password"})
    assert response.status_code == 403
    assert "disabled in microsoft_sso mode" in response.json()["detail"]

    await db_session.refresh(test_user)
    assert test_user.hashed_password == old_hash


@pytest.mark.asyncio
async def test_update_user_password_key_null_rejected_in_microsoft_sso_mode(
    auth_client_sso: AsyncClient,
    test_user: User,
    db_session: AsyncSession,
):
    old_hash = test_user.hashed_password
    response = await auth_client_sso.patch(f"/api/v1/users/{test_user.id}", json={"password": None})
    assert response.status_code == 403
    assert "disabled in microsoft_sso mode" in response.json()["detail"]

    await db_session.refresh(test_user)
    assert test_user.hashed_password == old_hash


@pytest.mark.asyncio
async def test_update_user_non_password_fields_allowed_in_microsoft_sso_mode(
    auth_client_sso: AsyncClient,
    test_user: User,
):
    response = await auth_client_sso.patch(
        f"/api/v1/users/{test_user.id}",
        json={"name": "SSO Allowed Update", "is_active": test_user.is_active},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "SSO Allowed Update"


@pytest.mark.asyncio
async def test_update_user_email_conflict(auth_client: AsyncClient, test_user: User, db_session: AsyncSession):
    """Test email uniqueness check during update."""
    # Create another user to conflict with
    other_user = User(
        email="conflict@example.com",
        hashed_password="hash",
        name="Conflict User",
        role_id=test_user.role_id,
        department_id=test_user.department_id,
        is_active=True,
    )
    db_session.add(other_user)
    await db_session.commit()

    update_data = {"email": "conflict@example.com"}
    response = await auth_client.patch(f"/api/v1/users/{test_user.id}", json=update_data)
    assert response.status_code == 400
    assert "Email already registered" in response.json()["detail"]


@pytest.mark.asyncio
async def test_list_roles(auth_client: AsyncClient):
    """Test listing roles."""
    response = await auth_client.get("/api/v1/users/roles")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1  # At least 'admin' from test_user fixture
    role_names = [r["name"] for r in data]
    assert "admin" in role_names


@pytest.mark.asyncio
async def test_mock_login_disabled_returns_404(
    client: AsyncClient,
    test_user: User,
):
    """Mock login endpoint should be unavailable unless debug+mock auth are both enabled."""
    def override_settings_disabled():
        return Settings(secret_key="test-secret-key-32-chars-minimum-value", debug=True, mock_auth_enabled=False)

    app.dependency_overrides[get_settings] = override_settings_disabled
    try:
        response = await client.post(f"/api/v1/users/mock-login/{test_user.id}")
        assert response.status_code == 404
        assert response.json()["detail"] == "Mock auth not enabled"
    finally:
        app.dependency_overrides.pop(get_settings, None)


@pytest.mark.asyncio
async def test_mock_login_enabled_in_debug_mode(
    client: AsyncClient,
    test_user: User,
):
    """Mock login endpoint should work only when debug+mock auth are enabled."""
    def override_settings_enabled():
        return Settings(secret_key="test-secret-key-32-chars-minimum-value", debug=True, mock_auth_enabled=True)

    app.dependency_overrides[get_settings] = override_settings_enabled
    try:
        response = await client.post(f"/api/v1/users/mock-login/{test_user.id}")
        assert response.status_code == 200
        payload = response.json()
        assert payload["user"]["id"] == test_user.id
        assert payload["user"]["email"] == test_user.email
    finally:
        app.dependency_overrides.pop(get_settings, None)


@pytest.mark.asyncio
async def test_lookup_paging_determinism(auth_client: AsyncClient, db_session: AsyncSession, test_role):
    """Test that user lookup paging is deterministic (no overlap between pages)."""
    from app.models import Department

    # Create a department for test users
    dept = Department(name="Paging Test Dept", code="PAGE-TEST")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Create 5 users
    users = []
    for i in range(5):
        u = User(
            name=f"Paging User {i}",
            email=f"paging-user-{i}@example.com",
            role_id=test_role.id,
            department_id=dept.id,
            is_active=True,
        )
        db_session.add(u)
        users.append(u)
    await db_session.commit()

    # Request page 1 (limit=2, skip=0)
    resp1 = await auth_client.get("/api/v1/users/lookup?limit=2&skip=0")
    assert resp1.status_code == 200
    ids1 = {u["id"] for u in resp1.json()}

    # Request page 2 (limit=2, skip=2)
    resp2 = await auth_client.get("/api/v1/users/lookup?limit=2&skip=2")
    assert resp2.status_code == 200
    ids2 = {u["id"] for u in resp2.json()}

    # No overlap between pages
    assert ids1.isdisjoint(ids2), "Paging should be deterministic with no overlap"


@pytest.mark.asyncio
async def test_lookup_department_scoping(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
):
    """Test that department-scoped users cannot see users from other departments."""
    from app.models import Department
    from app.models.user import AccessScope

    # Create two departments
    dept_a = Department(name="Scope Dept A", code="SCOPE-A")
    dept_b = Department(name="Scope Dept B", code="SCOPE-B")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)

    # Create user in dept A with DEPARTMENT scope
    user_a = User(
        name="Scope User A",
        email="scope-user-a@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(user_a)
    await db_session.commit()
    await db_session.refresh(user_a)

    # Request lookup with dept B filter → should return empty
    response = await client.get(
        f"/api/v1/users/lookup?department_id={dept_b.id}",
        headers={"X-Mock-User-Id": str(user_a.id)},
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_lookup_manager_department_filter_narrows_to_own_department(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
):
    """Managers can optionally narrow lookup to their own department only."""
    from app.models import Department
    from app.models.user import AccessScope

    dept_a = Department(name="Manager Scope Dept A", code="MGR-SCOPE-A")
    dept_b = Department(name="Manager Scope Dept B", code="MGR-SCOPE-B")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)

    manager = User(
        name="Manager Scope User",
        email="manager-scope@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        access_scope=AccessScope.MANAGER,
        is_active=True,
    )
    db_session.add(manager)
    await db_session.commit()
    await db_session.refresh(manager)

    same_dept_report = User(
        name="Manager Same Dept Report",
        email="manager-scope-same-dept@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        manager_id=manager.id,
        is_active=True,
    )
    cross_dept_report = User(
        name="Manager Cross Dept Report",
        email="manager-scope-cross-dept@example.com",
        role_id=test_role_employee.id,
        department_id=dept_b.id,
        manager_id=manager.id,
        is_active=True,
    )
    unrelated_user = User(
        name="Manager Unrelated User",
        email="manager-scope-unrelated@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        is_active=True,
    )
    db_session.add_all([same_dept_report, cross_dept_report, unrelated_user])
    await db_session.commit()
    await db_session.refresh(same_dept_report)
    await db_session.refresh(cross_dept_report)
    await db_session.refresh(unrelated_user)

    headers = {"X-Mock-User-Id": str(manager.id)}

    # No department filter: manager sees self + direct reports (cross-dept report included).
    response = await client.get("/api/v1/users/lookup", headers=headers)
    assert response.status_code == 200
    visible_ids = {u["id"] for u in response.json()}
    assert manager.id in visible_ids
    assert same_dept_report.id in visible_ids
    assert cross_dept_report.id in visible_ids
    assert unrelated_user.id not in visible_ids

    # Own-department filter narrows manager scope to own department only.
    response = await client.get(f"/api/v1/users/lookup?department_id={dept_a.id}", headers=headers)
    assert response.status_code == 200
    own_dept_ids = {u["id"] for u in response.json()}
    assert manager.id in own_dept_ids
    assert same_dept_report.id in own_dept_ids
    assert cross_dept_report.id not in own_dept_ids

    # Other department filter remains fail-closed.
    response = await client.get(f"/api/v1/users/lookup?department_id={dept_b.id}", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_lookup_limit_enforcement(auth_client: AsyncClient):
    """Test that lookup limit is capped at MAX_LOOKUP_SIZE (200) via Query validation."""
    # Request with limit above max → FastAPI Query rejects with 422
    response = await auth_client.get("/api/v1/users/lookup?limit=9999")
    assert response.status_code == 422  # Validation error

    # Request at max limit → should succeed
    response = await auth_client.get("/api/v1/users/lookup?limit=200")
    assert response.status_code == 200
    assert len(response.json()) <= 200
