"""
Tests for Control API endpoints.
"""
import pytest
from httpx import AsyncClient

from app.models import Control, Department, User


@pytest.mark.asyncio
async def test_create_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test creating a new control."""
    response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Test Control",
            "description": "A test control for verification",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Control"
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_list_controls(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test listing controls with pagination."""
    # Create a control first
    await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "List Test Control",
            "description": "Control for list test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "automatic",
            "frequency": "daily",
            "risk_level": 2,
            "status": "active",
        },
    )
    
    response = await auth_client.get("/api/v1/controls")
    
    assert response.status_code == 200
    data = response.json().get("items", [])
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test retrieving a single control."""
    # Create a control first
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Get Test Control",
            "description": "Control for get test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "weekly",
            "risk_level": 4,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]
    
    # Get the control
    response = await auth_client.get(f"/api/v1/controls/{control_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == control_id
    assert data["name"] == "Get Test Control"


@pytest.mark.asyncio
async def test_update_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test updating a control."""
    # Create a control first
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Update Test Control",
            "description": "Control for update test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]
    
    # Update the control
    response = await auth_client.patch(
        f"/api/v1/controls/{control_id}",
        json={
            "name": "Updated Control Name",
            "risk_level": 5,
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Control Name"
    assert data["risk_level"] == 5


@pytest.mark.asyncio
async def test_delete_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test soft deleting (archiving) a control."""
    # Create a control first
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Delete Test Control",
            "description": "Control for delete test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "quarterly",
            "risk_level": 2,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]
    
    # Delete the control
    response = await auth_client.delete(f"/api/v1/controls/{control_id}?reason=Testing deletion")
    
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_control_not_found(auth_client: AsyncClient, test_user: User):
    """Test getting a non-existent control returns 404."""
    response = await auth_client.get("/api/v1/controls/99999")
    
    assert response.status_code == 404
