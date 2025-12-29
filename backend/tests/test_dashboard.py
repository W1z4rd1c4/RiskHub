"""
Tests for Dashboard API endpoints.
"""
import pytest
from httpx import AsyncClient


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

