"""
Cross-Department Access Tests.
Validates that ownership grants cross-department access per BUSINESS_LOGIC.md Section 7.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk, Control, Department, User, KeyRiskIndicator
from app.models.risk import RiskStatus, ControlRiskLink
from app.models.control import ControlStatus
from app.models.control_execution import ControlExecution


# =============================================================================
# Cross-Department Control Owner Access Tests
# =============================================================================

@pytest.mark.asyncio
async def test_control_owner_can_create_execution_cross_dept(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """
    Control owner should be able to create execution for their cross-dept control
    (via /executions endpoint).
    """
    # Create a second department
    other_dept = Department(
        name="Other Test Dept",
        description="Secondary department",
        is_active=True,
    )
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)
    
    # Create a control in OTHER department, owned by test_user (who is in main dept)
    cross_dept_control = Control(
        name="Cross-Dept Control",
        description="Control in other dept owned by main user",
        department_id=other_dept.id,  # Different department
        control_owner_id=test_user.id,  # Owned by user from main dept
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.ACTIVE.value,
    )
    db_session.add(cross_dept_control)
    await db_session.commit()
    await db_session.refresh(cross_dept_control)
    
    # User (control owner) should be able to create execution despite cross-dept
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


@pytest.mark.asyncio
async def test_control_owner_can_list_own_cross_dept_executions(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """
    Control owner should see their cross-dept control's executions in /executions list.
    """
    # Create second department
    other_dept = Department(
        name="Other List Dept",
        description="For list test",
        is_active=True,
    )
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)
    
    # Create cross-dept control
    cross_dept_control = Control(
        name="Cross-Dept Control for List",
        description="Control for list test",
        department_id=other_dept.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.ACTIVE.value,
    )
    db_session.add(cross_dept_control)
    await db_session.commit()
    await db_session.refresh(cross_dept_control)
    
    # Create an execution
    execution = ControlExecution(
        control_id=cross_dept_control.id,
        executed_by_id=test_user.id,
        result="pass",
        findings="Test execution",
    )
    db_session.add(execution)
    await db_session.commit()
    
    # Owner should see this execution in list
    response = await auth_client.get("/api/v1/executions")
    assert response.status_code == 200
    
    executions = response.json()
    control_ids = [e["control_id"] for e in executions]
    assert cross_dept_control.id in control_ids


@pytest.mark.asyncio
async def test_non_owner_cannot_access_cross_dept_control_execution(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """
    Non-owner user cannot create execution for control in other department.
    (Negative case confirming ownership is required.)
    """
    # Create second department
    other_dept = Department(
        name="Inaccessible Dept",
        description="Dept the employee can't access",
        is_active=True,
    )
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)
    
    # Create control in other dept NOT owned by employee
    inaccessible_control = Control(
        name="Inaccessible Control",
        description="Control employee cannot access",
        department_id=other_dept.id,
        control_owner_id=None,  # No owner
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.ACTIVE.value,
    )
    db_session.add(inaccessible_control)
    await db_session.commit()
    await db_session.refresh(inaccessible_control)
    
    # Employee should NOT be able to create execution (403)
    response = await client_employee.post(
        "/api/v1/executions",
        json={
            "control_id": inaccessible_control.id,
            "result": "pass",
            "findings": "Should not work",
        },
    )
    
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_control_owner_can_view_risk_controls_cross_dept(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    test_department: Department,
):
    """
    Control owner in Dept A should be able to view risk-controls on a risk in Dept B
    if they own a control linked to that risk.
    """
    # Create second department
    other_dept = Department(
        name="Risk Dept",
        description="Department for risk",
        is_active=True,
    )
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)
    
    # Create risk in other department
    risk = Risk(
        risk_id_code="XDEPT-R01",
        name="Cross-Dept Risk",
        process="Cross-Dept Process",
        description="Risk in other dept",
        department_id=other_dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Test",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.ACTIVE.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    
    # Create control in other dept, owned by test_user
    control = Control(
        name="Owned Cross-Dept Control",
        description="Control owned by test user",
        department_id=other_dept.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.ACTIVE.value,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    
    # Link control to risk
    link = ControlRiskLink(
        control_id=control.id,
        risk_id=risk.id,
        effectiveness="effective",
    )
    db_session.add(link)
    await db_session.commit()
    
    # User should be able to view risk's controls (via ownership)
    response = await auth_client.get(f"/api/v1/risks/{risk.id}/controls")
    
    assert response.status_code == 200
    controls = response.json()
    assert len(controls) >= 1
    control_ids = [c["control_id"] for c in controls]
    assert control.id in control_ids
