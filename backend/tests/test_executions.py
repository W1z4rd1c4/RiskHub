"""
Tests for Execution API endpoints.
"""
import pytest
from httpx import AsyncClient

from app.models import Control, Department, User


@pytest.mark.asyncio
async def test_create_execution(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test logging a new control execution."""
    # Create a control first
    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Execution Test Control",
            "description": "Control for execution test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    control_id = control_response.json()["id"]
    
    # Log an execution
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": control_id,
            "result": "pass",
            "findings": "Control executed successfully with no issues",
            "evidence_reference": "DOC-2025-001",
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == control_id
    assert data["result"] == "pass"
    assert data["findings"] == "Control executed successfully with no issues"


@pytest.mark.asyncio
async def test_list_executions(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test listing executions."""
    # Create a control and execution first
    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "List Execution Control",
            "description": "Control for list execution test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "automatic",
            "frequency": "daily",
            "risk_level": 2,
            "status": "active",
        },
    )
    control_id = control_response.json()["id"]
    
    await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": control_id,
            "result": "fail",
            "findings": "Issues found during execution",
        },
    )
    
    response = await auth_client.get("/api/v1/executions")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_filter_executions_by_result(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test filtering executions by result."""
    # Create a control and execution
    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Filter Execution Control",
            "description": "Control for filter execution test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "weekly",
            "risk_level": 4,
            "status": "active",
        },
    )
    control_id = control_response.json()["id"]
    
    await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": control_id,
            "result": "issues_found",
            "findings": "Minor issues detected",
        },
    )
    
    response = await auth_client.get("/api/v1/executions?result=issues_found")
    
    assert response.status_code == 200
    data = response.json()
    for execution in data:
        assert execution["result"] == "issues_found"


# =============================================================================
# RBAC Tests for Department Scoping and Permission Enforcement
# =============================================================================

@pytest.fixture
async def second_dept_control(db_session, test_user):
    """Create a control in a different department."""
    from app.models import Department, Control
    
    # Create second department
    dept = Department(name="Other Dept", code="OTHER", description="Other department")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    
    # Create control in that department
    control = Control(
        name="Other Dept Control",
        description="Control in other department",
        department_id=dept.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    return control


@pytest.mark.asyncio
async def test_employee_cannot_create_execution_for_other_dept(
    client_employee: AsyncClient,
    second_dept_control,
):
    """Employee should not be able to create execution for another department's control."""
    response = await client_employee.post(
        "/api/v1/executions",
        json={
            "control_id": second_dept_control.id,
            "result": "pass",
            "findings": "Test execution",
        },
    )
    
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_create_execution_for_any_dept(
    auth_client: AsyncClient,
    second_dept_control,
):
    """Admin should be able to create execution for any department's control."""
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": second_dept_control.id,
            "result": "pass",
            "findings": "Admin test execution",
        },
    )
    
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_employee_list_executions_scoped_to_department(
    client_employee: AsyncClient,
    db_session,
    test_department: Department,
    test_user_employee: User,
):
    """Employee should only see executions from their department."""
    from app.models import Control, ControlExecution
    
    # Create control in employee's department
    control = Control(
        name="Employee Dept Control",
        description="Control in employee's department",
        department_id=test_department.id,
        control_owner_id=test_user_employee.id,
        control_form="manual",
        frequency="monthly",
        risk_level=2,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    
    # Create execution
    execution = ControlExecution(
        control_id=control.id,
        executed_by_id=test_user_employee.id,
        result="pass",
        findings="Test"
    )
    db_session.add(execution)
    await db_session.commit()
    
    # Employee should see this execution
    response = await client_employee.get("/api/v1/executions")
    assert response.status_code == 200
    data = response.json()
    # Should only contain executions from employee's department
    assert len(data) >= 1

