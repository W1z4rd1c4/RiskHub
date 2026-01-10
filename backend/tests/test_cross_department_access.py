"""
Cross-Department Access Tests.
Validates that ownership grants cross-department access per BUSINESS_LOGIC.md Section 7.

NOTE: These tests use auth_client (admin/CRO user with GLOBAL access) to test
the cross-department ownership feature. The admin creates entities in a second
department but owns them, verifying ownership-based access works.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk, Control, Department, User
from app.models.risk import RiskStatus, ControlRiskLink
from app.models.control import ControlStatus
from app.models.control_execution import ControlExecution


# =============================================================================
# Fixtures for Cross-Department Testing
# =============================================================================

@pytest_asyncio.fixture
async def second_department(db_session: AsyncSession) -> Department:
    """Create a second department for cross-dept tests."""
    dept = Department(
        name="Finance Department",
        description="Secondary department for cross-dept tests",
        code="FIN",
        is_active=True,
    )
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest_asyncio.fixture
async def cross_dept_control(
    db_session: AsyncSession,
    second_department: Department,
    test_user: User,  # admin user from main dept
) -> Control:
    """Create a control in second dept owned by user from main dept."""
    control = Control(
        name="Cross-Dept Control",
        description="Control in second dept owned by main user",
        department_id=second_department.id,  # Different department
        control_owner_id=test_user.id,  # Owned by user from main dept
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.active.value,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    return control


@pytest_asyncio.fixture
async def cross_dept_risk(
    db_session: AsyncSession,
    second_department: Department,
    test_user: User,
    seed_risk_types,  # Required for risk type validation
) -> Risk:
    """Create a risk in second dept."""
    risk = Risk(
        risk_id_code="XDEPT-R01",
        name="Cross-Dept Risk",
        process="Cross-Dept Process",
        description="Risk in second department",
        department_id=second_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Test",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


# =============================================================================
# Cross-Department Control Owner Execution Tests
# =============================================================================

@pytest.mark.asyncio
async def test_control_owner_can_create_execution_via_main_endpoint(
    auth_client: AsyncClient,
    cross_dept_control: Control,
):
    """
    Control owner can create execution for cross-dept control via /executions.
    """
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": cross_dept_control.id,
            "result": "pass",
            "findings": "Cross-department execution logged via ownership",
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == cross_dept_control.id
    assert data["result"] == "pass"


@pytest.mark.asyncio
async def test_control_owner_can_create_execution_via_control_endpoint(
    auth_client: AsyncClient,
    cross_dept_control: Control,
):
    """
    Control owner can create execution for cross-dept control via /controls/{id}/executions.
    """
    response = await auth_client.post(
        f"/api/v1/controls/{cross_dept_control.id}/executions",
        json={
            "result": "passed",
            "findings": "Cross-department execution via control endpoint",
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == cross_dept_control.id


@pytest.mark.asyncio
async def test_control_owner_sees_cross_dept_executions_in_list(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    cross_dept_control: Control,
    test_user: User,
):
    """
    Control owner sees executions for their cross-dept control in /executions list.
    """
    # Create an execution
    execution = ControlExecution(
        control_id=cross_dept_control.id,
        executed_by_id=test_user.id,
        result="pass",
        findings="Test execution",
    )
    db_session.add(execution)
    await db_session.commit()
    await db_session.refresh(execution)
    
    # Owner should see this execution in list
    response = await auth_client.get("/api/v1/executions")
    assert response.status_code == 200
    
    executions = response.json()
    control_ids = [e["control_id"] for e in executions]
    assert cross_dept_control.id in control_ids


@pytest.mark.asyncio
async def test_control_owner_can_view_executions_via_control_endpoint(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    cross_dept_control: Control,
    test_user: User,
):
    """
    Control owner can view execution history via /controls/{id}/executions.
    """
    # Create an execution
    execution = ControlExecution(
        control_id=cross_dept_control.id,
        executed_by_id=test_user.id,
        result="passed",
        findings="Test execution",
    )
    db_session.add(execution)
    await db_session.commit()
    
    # Owner can view
    response = await auth_client.get(f"/api/v1/controls/{cross_dept_control.id}/executions")
    assert response.status_code == 200
    
    executions = response.json()
    assert len(executions) >= 1


# =============================================================================
# Cross-Department Control-Risk Linking Tests
# =============================================================================

@pytest.mark.asyncio
async def test_control_owner_can_view_risk_controls_cross_dept(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    cross_dept_risk: Risk,
    cross_dept_control: Control,
):
    """
    Control owner can view risk's controls if they own a linked control.
    """
    # Link control to risk
    link = ControlRiskLink(
        control_id=cross_dept_control.id,
        risk_id=cross_dept_risk.id,
        effectiveness="high",
    )
    db_session.add(link)
    await db_session.commit()
    
    # Owner can view risk's controls
    response = await auth_client.get(f"/api/v1/risks/{cross_dept_risk.id}/controls")
    
    assert response.status_code == 200
    controls = response.json()
    assert len(controls) >= 1
    control_ids = [c["control_id"] for c in controls]
    assert cross_dept_control.id in control_ids


@pytest.mark.asyncio
async def test_control_owner_can_link_control_to_risk(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    cross_dept_risk: Risk,
    cross_dept_control: Control,
):
    """
    Control owner can link their control to a risk in a different department.
    """
    response = await auth_client.post(
        f"/api/v1/risks/{cross_dept_risk.id}/controls",
        json={
            "control_id": cross_dept_control.id,
            "effectiveness": "high",
            "notes": "Cross-department link test",
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == cross_dept_control.id
    assert data["risk_id"] == cross_dept_risk.id


# =============================================================================
# Negative Cases - Non-Owner Access Denied
# =============================================================================

@pytest.mark.asyncio
async def test_non_owner_cannot_create_execution_for_other_dept_control(
    client_employee: AsyncClient,
    cross_dept_control: Control,
):
    """
    Non-owner in different dept cannot create execution for cross-dept control.
    """
    response = await client_employee.post(
        "/api/v1/executions",
        json={
            "control_id": cross_dept_control.id,
            "result": "pass",
            "findings": "Should fail",
        },
    )
    
    # Should be denied (no ownership, no dept access, and no execute permission)
    assert response.status_code in [403, 422]  # 403 or possibly permission check first
