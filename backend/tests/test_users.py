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
