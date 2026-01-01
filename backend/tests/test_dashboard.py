"""
Tests for Dashboard API endpoints.
"""
import pytest
from httpx import AsyncClient
from app.models import Role, Department
from app.models.user import AccessScope


@pytest.mark.asyncio
async def test_dashboard_summary(auth_client: AsyncClient):
    """Test the dashboard summary endpoint."""
    response = await auth_client.get("/api/v1/dashboard/summary")
    
    assert response.status_code == 200
    data = response.json()
    assert "total_controls" in data
    assert "total_risks" in data


@pytest.mark.asyncio
async def test_risk_distribution(auth_client: AsyncClient):
    """Test the risk distribution endpoint."""
    response = await auth_client.get("/api/v1/dashboard/risk-distribution")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_departments(auth_client: AsyncClient):
    """Test the departments endpoint."""
    response = await auth_client.get("/api/v1/dashboard/departments")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_control_trends_empty_dept_ids_returns_empty(
    client: AsyncClient,
    db_session,
    test_role_employee,
    monkeypatch,
):
    """
    Users with empty department scope (dept_ids=[]) should get empty control-trends.
    This tests the fix for the security issue where empty list was truthy-bypassed.
    """
    from sqlalchemy import select
    from app.models import User, Department
    
    # Create a department first (required for FK)
    dept = Department(name="Test Dept for Empty Scope", code="TEST-EMPTY")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    
    # Create a user with NO department (will get dept_ids=[])
    user_no_dept = User(
        name="No Department User",
        email="nodept@example.com",
        role_id=test_role_employee.id,
        department_id=None,  # No department assigned
        is_active=True,
    )
    db_session.add(user_no_dept)
    await db_session.commit()
    await db_session.refresh(user_no_dept)
    
    # Make request as this user (mock auth)
    response = await client.get(
        "/api/v1/dashboard/control-trends",
        headers={"X-Mock-User-Id": str(user_no_dept.id)}
    )
    
    assert response.status_code == 200
    data = response.json()
    # Should be empty list, not all data
    assert data == []


@pytest.mark.asyncio
async def test_departments_filtering_inactive(
    client: AsyncClient,
    db_session,
    test_role: Role,
):
    """Test that departments with no active users (and not system) are filtered out."""
    from app.models import Department, User
    
    # 1. Create a system department (should STAY visible)
    system_dept = Department(name="System Dept", code="SYS-1", is_system=True)
    
    # 2. Create a department with an active user (should STAY visible)
    active_dept = Department(name="Active Dept", code="ACT-1", is_system=False)
    
    # 3. Create a department with NO users (should be HIDDEN)
    inactive_dept = Department(name="Inactive Dept", code="INA-1", is_system=False)
    
    db_session.add_all([system_dept, active_dept, inactive_dept])
    await db_session.commit()
    await db_session.refresh(system_dept)
    await db_session.refresh(active_dept)
    
    # Add active user to active_dept
    active_user = User(
        name="Active User",
        email="active.user.dept@example.com",
        role_id=test_role.id,
        department_id=active_dept.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(active_user)
    
    # Add an ADMIN user for the request (global scope)
    admin_user = User(
        name="Global Admin",
        email="global.admin@example.com",
        role_id=test_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(admin_user)
    await db_session.commit()
    
    # Request dashboard departments as admin
    response = await client.get(
        "/api/v1/dashboard/departments",
        headers={"X-Mock-User-Id": str(admin_user.id)}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    dept_names = [d["department_name"] for d in data]
    
    assert "System Dept" in dept_names
    assert "Active Dept" in dept_names
    assert "Inactive Dept" not in dept_names


@pytest.mark.asyncio
async def test_risk_trends(auth_client: AsyncClient):
    """Test the risk trends endpoint returns 200 and valid structure."""
    response = await auth_client.get("/api/v1/dashboard/risk-trends")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Each item should have period, total_new, critical_new
    for item in data:
        assert "period" in item
        assert "total_new" in item
        assert "critical_new" in item


@pytest.mark.asyncio
async def test_kri_breach_trends(auth_client: AsyncClient):
    """Test the KRI breach trends endpoint returns 200 and valid structure."""
    response = await auth_client.get("/api/v1/dashboard/kri-breach-trends")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Each item should have period, total_entries, breached_entries
    for item in data:
        assert "period" in item
        assert "total_entries" in item
        assert "breached_entries" in item


@pytest.mark.asyncio
async def test_control_trends(auth_client: AsyncClient):
    """Test the control trends endpoint returns 200 and valid structure."""
    response = await auth_client.get("/api/v1/dashboard/control-trends")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Each item should have period and execution_count
    for item in data:
        assert "period" in item
        assert "execution_count" in item
