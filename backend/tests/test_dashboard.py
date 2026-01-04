"""
Tests for Dashboard API endpoints.
"""
from datetime import datetime, timedelta
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


@pytest.mark.asyncio
async def test_committee_endpoints_denied_for_employee(client_employee: AsyncClient):
    """Employees must not access Risk Committee endpoints."""
    resp_summary = await client_employee.get("/api/v1/dashboard/committee-summary")
    assert resp_summary.status_code == 403

    resp_quarterly = await client_employee.get("/api/v1/dashboard/quarterly-comparison")
    assert resp_quarterly.status_code == 403


@pytest.mark.asyncio
async def test_committee_endpoints_denied_for_admin(auth_client: AsyncClient):
    """Admin is console-only and must not access Risk Committee endpoints."""
    resp_summary = await auth_client.get("/api/v1/dashboard/committee-summary")
    assert resp_summary.status_code == 403

    resp_quarterly = await auth_client.get("/api/v1/dashboard/quarterly-comparison")
    assert resp_quarterly.status_code == 403


@pytest.mark.asyncio
async def test_committee_summary_scoped_for_department_head(client: AsyncClient, db_session):
    """Department Heads can access committee summary, but only for their department."""
    from app.models import User, Risk, ActivityLog
    from app.models.risk import RiskStatus

    dept_a = Department(name="Dept A", code="D-A")
    dept_b = Department(name="Dept B", code="D-B")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)

    role = Role(name="department_head", display_name="Department Head", description="Dept head")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    dept_head = User(
        name="Dept Head",
        email="dept.head@example.com",
        role_id=role.id,
        department_id=dept_a.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(dept_head)
    await db_session.commit()
    await db_session.refresh(dept_head)

    risk_a = Risk(
        risk_id_code="A-001",
        name="Risk A",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_a.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now() - timedelta(days=1),
    )
    risk_b = Risk(
        risk_id_code="B-001",
        name="Risk B",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_b.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now() - timedelta(days=1),
    )
    db_session.add_all([risk_a, risk_b])
    await db_session.commit()

    # Activity logs in both departments; dept head should only see Dept A logs.
    log_a = ActivityLog(
        entity_type="risk",
        entity_id=1,
        entity_name="Risk A",
        action="create",
        actor_id=dept_head.id,
        actor_name=dept_head.name,
        department_id=dept_a.id,
        changes=None,
        description="Created risk A",
        created_at=datetime.now() - timedelta(days=2),
    )
    log_b = ActivityLog(
        entity_type="risk",
        entity_id=2,
        entity_name="Risk B",
        action="create",
        actor_id=dept_head.id,
        actor_name=dept_head.name,
        department_id=dept_b.id,
        changes=None,
        description="Created risk B",
        created_at=datetime.now() - timedelta(days=2),
    )
    db_session.add_all([log_a, log_b])
    await db_session.commit()

    response = await client.get(
        "/api/v1/dashboard/committee-summary",
        headers={"X-Mock-User-Id": str(dept_head.id)},
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["department_exposure"]
    assert all(d["id"] == dept_a.id for d in payload["department_exposure"])

    assert payload["critical_risks"]
    assert all(r["department_name"] == dept_a.name for r in payload["critical_risks"])

    assert payload["recent_activity"]
    assert all(a["description"] == "Created risk A" for a in payload["recent_activity"])


@pytest.mark.asyncio
async def test_quarterly_comparison_scoped_for_department_head(client: AsyncClient, db_session):
    """Department Heads can access quarterly metrics, scoped to their department."""
    from app.models import User, Risk
    from app.models.risk import RiskStatus

    dept_a = Department(name="Dept A2", code="D-A2")
    dept_b = Department(name="Dept B2", code="D-B2")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)

    role = Role(name="department_head", display_name="Department Head", description="Dept head")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    dept_head = User(
        name="Dept Head 2",
        email="dept.head2@example.com",
        role_id=role.id,
        department_id=dept_a.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(dept_head)
    await db_session.commit()
    await db_session.refresh(dept_head)

    risk_a = Risk(
        risk_id_code="A2-001",
        name="Risk A2",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_a.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now() - timedelta(days=1),
    )
    risk_b = Risk(
        risk_id_code="B2-001",
        name="Risk B2",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_b.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now() - timedelta(days=1),
    )
    db_session.add_all([risk_a, risk_b])
    await db_session.commit()

    response = await client.get(
        "/api/v1/dashboard/quarterly-comparison",
        headers={"X-Mock-User-Id": str(dept_head.id)},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["this_quarter"]["new_risks"] == 1
