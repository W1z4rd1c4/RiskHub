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
async def test_list_controls_normalizes_legacy_semi_annual_frequency(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """List endpoint should normalize legacy semi-annual frequency aliases."""
    legacy_control = Control(
        name="Legacy Frequency List Control",
        description="Control with legacy frequency alias",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="semi_annually",
        risk_level=3,
        status="active",
    )
    db_session.add(legacy_control)
    await db_session.commit()
    await db_session.refresh(legacy_control)

    response = await auth_client.get("/api/v1/controls?include_archived=true")
    assert response.status_code == 200

    item = next(
        (entry for entry in response.json()["items"] if entry["id"] == legacy_control.id),
        None,
    )
    assert item is not None
    assert item["frequency"] == "semi-annually"


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
async def test_get_control_normalizes_legacy_semi_annual_frequency(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """Detail endpoint should normalize legacy semi-annual frequency aliases."""
    legacy_control = Control(
        name="Legacy Frequency Detail Control",
        description="Control with legacy frequency alias",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="semiannual",
        risk_level=3,
        status="active",
    )
    db_session.add(legacy_control)
    await db_session.commit()
    await db_session.refresh(legacy_control)

    response = await auth_client.get(f"/api/v1/controls/{legacy_control.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == legacy_control.id
    assert data["frequency"] == "semi-annually"


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


@pytest.mark.asyncio
async def test_control_list_include_archived_toggle(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
):
    """Default list excludes archived controls; include_archived=true returns them."""
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Archived Toggle Control",
            "description": "Control used to validate include_archived",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    archive_response = await auth_client.delete(f"/api/v1/controls/{control_id}?reason=Archive+for+test")
    assert archive_response.status_code == 204

    default_list = await auth_client.get("/api/v1/controls")
    assert default_list.status_code == 200
    default_ids = {item["id"] for item in default_list.json()["items"]}
    assert control_id not in default_ids

    archived_list = await auth_client.get("/api/v1/controls?include_archived=true")
    assert archived_list.status_code == 200
    archived_ids = {item["id"] for item in archived_list.json()["items"]}
    assert control_id in archived_ids


@pytest.mark.asyncio
async def test_control_restore_reactivates_archived_control(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
):
    """Restore endpoint sets archived control back to active."""
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Restore Control",
            "description": "Control used to validate restore",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 2,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    archive_response = await auth_client.delete(f"/api/v1/controls/{control_id}?reason=Archive+for+restore")
    assert archive_response.status_code == 204

    restore_response = await auth_client.post(f"/api/v1/controls/{control_id}/restore")
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "active"


@pytest.mark.asyncio
async def test_control_restore_requires_delete_permission(
    client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """Users without controls:delete cannot call restore endpoint."""
    admin_headers = {"X-Mock-User-Id": str(test_user.id)}

    create_response = await client.post(
        "/api/v1/controls",
        json={
            "name": "Forbidden Restore Control",
            "description": "Control used to validate restore RBAC",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 2,
            "status": "active",
        },
        headers=admin_headers,
    )
    control_id = create_response.json()["id"]

    archive_response = await client.delete(
        f"/api/v1/controls/{control_id}?reason=Archive+for+rbac",
        headers=admin_headers,
    )
    assert archive_response.status_code == 204

    from app.models import Role
    from app.models import User as UserModel
    from app.models.user import AccessScope

    readonly_role = Role(name="control_readonly", display_name="Control Read Only", description="control read only")
    db_session.add(readonly_role)
    await db_session.commit()
    await db_session.refresh(readonly_role)

    readonly_user = UserModel(
        name="Control Readonly User",
        email="control-readonly@test.com",
        department_id=test_department.id,
        role_id=readonly_role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(readonly_user)
    await db_session.commit()
    await db_session.refresh(readonly_user)

    forbidden = await client.post(
        f"/api/v1/controls/{control_id}/restore",
        headers={"X-Mock-User-Id": str(readonly_user.id)},
    )
    assert forbidden.status_code == 403
