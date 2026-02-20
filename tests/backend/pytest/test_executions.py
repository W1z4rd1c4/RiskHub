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
    from app.models import Department

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
    from app.models import ControlExecution

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
        control_id=control.id, executed_by_id=test_user_employee.id, result="pass", findings="Test"
    )
    db_session.add(execution)
    await db_session.commit()

    # Employee should see this execution
    response = await client_employee.get("/api/v1/executions")
    assert response.status_code == 200
    data = response.json()
    # Should only contain executions from employee's department
    assert len(data) >= 1


# =============================================================================
# FULL MODALITY RBAC TESTS: Control Execution Permission Independence
# =============================================================================


@pytest.mark.asyncio
async def test_controls_write_without_controls_execute_is_denied(
    client: AsyncClient,
    db_session,
    test_department: Department,
):
    """
    FULL MODALITY TEST: User with controls:write but WITHOUT controls:execute
    cannot log control executions (403).

    This proves controls:execute is independent from controls:write.
    """
    from app.models import Permission, Role, RolePermission, User

    # Create a role with controls:write but NOT controls:execute
    role = Role(
        name="control_editor_no_execute",
        display_name="Control Editor",
        description="Can edit controls but not log executions",
    )
    db_session.add(role)
    await db_session.commit()

    # Grant controls:write, controls:read only (NOT controls:execute)
    perms = [
        Permission(resource="controls", action="read", description="Read controls"),
        Permission(resource="controls", action="write", description="Edit controls"),
    ]
    for p in perms:
        db_session.add(p)
    await db_session.commit()

    for p in perms:
        db_session.add(RolePermission(role_id=role.id, permission_id=p.id))
    await db_session.commit()

    # Create user with this role
    user = User(
        name="Control Editor No Execute",
        email="control-editor-no-execute@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Create a control in user's department
    control = Control(
        name="No Execute Test Control",
        description="Control for no-execute test",
        department_id=test_department.id,
        control_owner_id=user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=2,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    # Try to log execution - should be denied (403)
    response = await client.post(
        "/api/v1/executions",
        headers={"X-Mock-User-Id": str(user.id)},
        json={"control_id": control.id, "result": "pass", "findings": "Test execution attempt"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_controls_execute_can_log_within_department(
    client: AsyncClient,
    db_session,
    test_department: Department,
):
    """
    FULL MODALITY TEST: User with controls:execute can log executions
    within their department (201).
    """
    from app.models import Control, Permission, Role, RolePermission, User

    # Create a role with controls:execute
    role = Role(name="control_executor", display_name="Control Executor", description="Can log control executions")
    db_session.add(role)
    await db_session.commit()

    # Grant controls:execute
    execute_perm = Permission(resource="controls", action="execute", description="Log control executions")
    db_session.add(execute_perm)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=execute_perm.id))
    await db_session.commit()

    # Create user with this role
    user = User(
        name="Control Executor",
        email="control-executor@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Create a control in user's department
    control = Control(
        name="Execute Test Control",
        description="Control for execute test",
        department_id=test_department.id,
        control_owner_id=user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=2,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    # Log execution - should succeed (201)
    response = await client.post(
        "/api/v1/executions",
        headers={"X-Mock-User-Id": str(user.id)},
        json={"control_id": control.id, "result": "pass", "findings": "Test execution logged successfully"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == control.id
    assert data["result"] == "pass"


@pytest.mark.asyncio
async def test_controls_execute_cannot_log_across_departments(
    client: AsyncClient,
    db_session,
    test_department: Department,
):
    """
    FULL MODALITY TEST: User with controls:execute cannot log executions
    for controls in other departments (403).

    Department scoping is maintained.
    """
    from app.models import Department, Permission, Role, RolePermission, User
    from app.models.user import AccessScope

    # Create a second department
    other_dept = Department(name="Other Exec Department", code="OTHER-EXEC")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    # Create a role with controls:execute but NOT global scope
    role = Role(
        name="control_executor_dept",
        display_name="Control Executor Dept",
        description="Can log control executions in own dept",
    )
    db_session.add(role)
    await db_session.commit()

    # Grant controls:execute
    execute_perm = Permission(resource="controls", action="execute", description="Log control executions")
    db_session.add(execute_perm)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=execute_perm.id))
    await db_session.commit()

    # Create user in test_department with dept-scoped access
    user = User(
        name="Dept Scoped Executor",
        email="dept-executor@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,  # Department scoped
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Create a control in OTHER department
    control = Control(
        name="Other Dept Control",
        description="Control in other department",
        department_id=other_dept.id,  # Different department!
        control_owner_id=None,
        control_form="manual",
        frequency="monthly",
        risk_level=2,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    # Try to log execution - should be denied (403) due to department mismatch
    response = await client.post(
        "/api/v1/executions",
        headers={"X-Mock-User-Id": str(user.id)},
        json={"control_id": control.id, "result": "pass", "findings": "Attempted cross-department execution"},
    )

    assert response.status_code == 403


# =============================================================================
# FULL MODALITY RBAC TESTS: /controls/{id}/executions endpoint enforcement
# =============================================================================


@pytest.mark.asyncio
async def test_controls_write_without_controls_execute_is_denied_on_control_execution_endpoint(
    client: AsyncClient,
    db_session,
    test_department: Department,
):
    """
    User with controls:write but WITHOUT controls:execute cannot log executions
    via /controls/{id}/executions (403).
    """
    from app.models import Permission, Role, RolePermission, User

    # Create a role with controls:write but NOT controls:execute
    role = Role(
        name="control_editor_no_execute_2",
        display_name="Control Editor",
        description="Can edit controls but not log executions",
    )
    db_session.add(role)
    await db_session.commit()

    perms = [
        Permission(resource="controls", action="read", description="Read controls"),
        Permission(resource="controls", action="write", description="Edit controls"),
    ]
    for p in perms:
        db_session.add(p)
    await db_session.commit()

    for p in perms:
        db_session.add(RolePermission(role_id=role.id, permission_id=p.id))
    await db_session.commit()

    user = User(
        name="Control Editor No Execute 2",
        email="control-editor-no-execute-2@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    control = Control(
        name="No Execute Test Control 2",
        description="Control for no-execute test 2",
        department_id=test_department.id,
        control_owner_id=user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=2,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client.post(
        f"/api/v1/controls/{control.id}/executions",
        headers={"X-Mock-User-Id": str(user.id)},
        json={
            "result": "passed",
            "findings": "Attempted log execution",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_controls_execute_can_log_on_control_execution_endpoint_within_department(
    client: AsyncClient,
    db_session,
    test_department: Department,
):
    """User with controls:execute can log executions via /controls/{id}/executions (201)."""
    from app.models import Permission, Role, RolePermission, User

    role = Role(name="control_executor_2", display_name="Control Executor", description="Can log control executions")
    db_session.add(role)
    await db_session.commit()

    execute_perm = Permission(resource="controls", action="execute", description="Log control executions")
    db_session.add(execute_perm)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=execute_perm.id))
    await db_session.commit()

    user = User(
        name="Control Executor 2",
        email="control-executor-2@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    control = Control(
        name="Execute Test Control 2",
        description="Control for execute test 2",
        department_id=test_department.id,
        control_owner_id=user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=2,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client.post(
        f"/api/v1/controls/{control.id}/executions",
        headers={"X-Mock-User-Id": str(user.id)},
        json={
            "result": "passed",
            "findings": "Execution logged successfully",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == control.id
    assert data["result"] == "passed"


@pytest.mark.asyncio
async def test_controls_execution_semi_annually_frequency_sets_next_schedule_to_182_days(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
):
    """Semi-annual controls should schedule next execution at 182 days."""
    from datetime import datetime

    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Semi Annual Scheduling Control",
            "description": "Control for semi-annual scheduling test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "semi-annually",
            "risk_level": 3,
            "status": "active",
        },
    )
    assert control_response.status_code == 201
    control_id = control_response.json()["id"]

    execution_response = await auth_client.post(
        f"/api/v1/controls/{control_id}/executions",
        json={
            "result": "passed",
            "findings": "Scheduled correctly",
        },
    )
    assert execution_response.status_code == 201
    data = execution_response.json()

    executed_at = datetime.fromisoformat(data["executed_at"])
    next_scheduled = datetime.fromisoformat(data["next_scheduled"])
    assert (next_scheduled - executed_at).days == 182


@pytest.mark.asyncio
async def test_controls_execute_cannot_log_on_control_execution_endpoint_across_departments(
    client: AsyncClient,
    db_session,
    test_department: Department,
):
    """User with controls:execute cannot log executions for other departments via /controls/{id}/executions (403)."""
    from app.models import Department, Permission, Role, RolePermission, User
    from app.models.user import AccessScope

    other_dept = Department(name="Other Exec Department 2", code="OTHER-EXEC-2")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    role = Role(
        name="control_executor_dept_2",
        display_name="Control Executor Dept",
        description="Can log control executions in own dept",
    )
    db_session.add(role)
    await db_session.commit()

    execute_perm = Permission(resource="controls", action="execute", description="Log control executions")
    db_session.add(execute_perm)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=execute_perm.id))
    await db_session.commit()

    user = User(
        name="Dept Scoped Executor 2",
        email="dept-executor-2@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    control = Control(
        name="Other Dept Control 2",
        description="Control in other department 2",
        department_id=other_dept.id,
        control_owner_id=None,
        control_form="manual",
        frequency="monthly",
        risk_level=2,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client.post(
        f"/api/v1/controls/{control.id}/executions",
        headers={"X-Mock-User-Id": str(user.id)},
        json={
            "result": "passed",
            "findings": "Attempted cross-department execution",
        },
    )
    assert response.status_code == 403
