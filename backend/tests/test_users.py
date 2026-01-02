import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.endpoints.users import get_password_hash
from app.core.security import verify_password
from app.models import User

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
async def test_update_user_email_conflict(auth_client: AsyncClient, test_user: User, db_session: AsyncSession):
    """Test email uniqueness check during update."""
    # Create another user to conflict with
    other_user = User(
        email="conflict@example.com", 
        hashed_password="hash", 
        name="Conflict User",
        role_id=test_user.role_id,
        department_id=test_user.department_id,
        is_active=True
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
async def test_lookup_limit_enforcement(auth_client: AsyncClient):
    """Test that lookup limit is capped at MAX_LOOKUP_SIZE (200) via Query validation."""
    # Request with limit above max → FastAPI Query rejects with 422
    response = await auth_client.get("/api/v1/users/lookup?limit=9999")
    assert response.status_code == 422  # Validation error
    
    # Request at max limit → should succeed
    response = await auth_client.get("/api/v1/users/lookup?limit=200")
    assert response.status_code == 200
    assert len(response.json()) <= 200
