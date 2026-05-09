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

from app.models import Control, Department, KeyRiskIndicator, Risk, User
from app.models.control import ControlStatus
from app.models.control_execution import ControlExecution
from app.models.risk import ControlRiskLink, RiskStatus

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
            "result": "passed",
            "findings": "Cross-department execution logged via ownership",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == cross_dept_control.id
    assert data["result"] == "passed"


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
    client_cro: AsyncClient,
    db_session: AsyncSession,
    second_department: Department,
    test_user_cro: User,
):
    """
    Control owner sees executions for their cross-dept control in /executions list.
    """
    cross_dept_control = Control(
        name="Cross-Dept Control For Execution List",
        description="Control in second dept owned by CRO user",
        department_id=second_department.id,
        control_owner_id=test_user_cro.id,
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.active.value,
    )
    db_session.add(cross_dept_control)
    await db_session.commit()
    await db_session.refresh(cross_dept_control)

    # Create an execution
    execution = ControlExecution(
        control_id=cross_dept_control.id,
        executed_by_id=test_user_cro.id,
        result="passed",
        findings="Test execution",
    )
    db_session.add(execution)
    await db_session.commit()
    await db_session.refresh(execution)

    # Owner should see this execution in list
    response = await client_cro.get("/api/v1/executions")
    assert response.status_code == 200

    executions = response.json()["items"]
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
# Cross-Department Control-Side Linking Tests (Phase 154-02)
# Validates control-side endpoints mirror risk-side cross-dept access
# =============================================================================


@pytest.mark.asyncio
async def test_control_owner_can_list_risks_via_control_endpoint(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    cross_dept_risk: Risk,
    cross_dept_control: Control,
):
    """
    Control owner can list linked risks via /controls/{id}/risks (cross-department).
    """
    # Link control to risk first
    link = ControlRiskLink(
        control_id=cross_dept_control.id,
        risk_id=cross_dept_risk.id,
        effectiveness="high",
    )
    db_session.add(link)
    await db_session.commit()

    # Control owner can list risks via control-side endpoint
    response = await auth_client.get(f"/api/v1/controls/{cross_dept_control.id}/risks")

    assert response.status_code == 200
    risks = response.json()
    assert len(risks) >= 1
    risk_ids = [r["risk_id"] for r in risks]
    assert cross_dept_risk.id in risk_ids


@pytest.mark.asyncio
async def test_control_owner_can_link_risk_via_control_endpoint(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    cross_dept_risk: Risk,
    cross_dept_control: Control,
):
    """
    Control owner can link a risk via /controls/{id}/risks (cross-department).
    """
    response = await auth_client.post(
        f"/api/v1/controls/{cross_dept_control.id}/risks",
        json={
            "risk_id": cross_dept_risk.id,
            "effectiveness": "medium",
            "notes": "Control-side cross-department link test",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == cross_dept_control.id
    assert data["risk_id"] == cross_dept_risk.id


@pytest.mark.asyncio
async def test_control_owner_can_unlink_risk_via_control_endpoint(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    cross_dept_risk: Risk,
    cross_dept_control: Control,
):
    """
    Control owner can unlink a risk via /controls/{id}/risks/{rid} (cross-department).
    """
    # Link control to risk first
    link = ControlRiskLink(
        control_id=cross_dept_control.id,
        risk_id=cross_dept_risk.id,
        effectiveness="low",
    )
    db_session.add(link)
    await db_session.commit()

    # Control owner can unlink via control-side endpoint
    response = await auth_client.delete(f"/api/v1/controls/{cross_dept_control.id}/risks/{cross_dept_risk.id}")

    assert response.status_code == 204


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
            "result": "passed",
            "findings": "Should fail",
        },
    )

    # Should be denied (no ownership, no dept access, and no execute permission)
    assert response.status_code in [403, 422]  # 403 or possibly permission check first


@pytest.mark.asyncio
async def test_risk_owner_can_restore_cross_department_archived_risk(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    second_department: Department,
    test_user_approval_requester: User,
    seed_risk_types,
):
    """
    Risk owner can restore an archived risk even when department-scoped to a different department.
    Mirrors cross-department owner access policy used by risk restore endpoint.
    """
    risk = Risk(
        risk_id_code="XDEPT-R-RESTORE",
        name="Cross-Dept Archived Risk",
        process="Cross-Dept Restore",
        description="Archived risk in another department owned by employee",
        department_id=second_department.id,
        owner_id=test_user_approval_requester.id,
        risk_type="operational",
        category="Test",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
        is_archived=True,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    response = await client_approval_requester.post(f"/api/v1/risks/{risk.id}/restore")
    assert response.status_code == 200
    assert response.json()["status"] == "active"


@pytest.mark.asyncio
async def test_cross_department_risk_owner_cannot_create_child_kri(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    second_department: Department,
    test_user_approval_requester: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="XDEPT-R-KRI",
        name="Cross-Dept KRI Parent Risk",
        process="Cross-Dept KRI",
        description="Risk owned across department boundary",
        department_id=second_department.id,
        owner_id=test_user_approval_requester.id,
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

    detail_response = await client_approval_requester.get(f"/api/v1/risks/{risk.id}")

    assert detail_response.status_code == 200
    capabilities = detail_response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_update"] is True
    assert capabilities["can_create_kri"] is False

    create_response = await client_approval_requester.post(
        "/api/v1/kris",
        json={
            "risk_id": risk.id,
            "metric_name": "Cross-Dept Blocked KRI",
            "description": "KRI creation should follow department access",
            "current_value": 50.0,
            "lower_limit": 20.0,
            "upper_limit": 80.0,
            "unit": "%",
            "frequency": "monthly",
        },
    )
    assert create_response.status_code == 403


@pytest.mark.asyncio
async def test_cross_department_risk_owner_cannot_manage_risk_side_control_links(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    second_department: Department,
    test_department: Department,
    test_user_approval_requester: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="XDEPT-R-LINK-DENY",
        name="Cross-Dept Link Denied Risk",
        process="Cross-Dept Link",
        description="Risk owned across department boundary",
        department_id=second_department.id,
        owner_id=test_user_approval_requester.id,
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
    control = Control(
        name="Requester Same-Dept Control",
        description="Accessible control for denied risk-side link attempt",
        department_id=test_department.id,
        control_owner_id=test_user_approval_requester.id,
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.active.value,
    )
    db_session.add_all([risk, control])
    await db_session.commit()
    await db_session.refresh(risk)
    await db_session.refresh(control)

    detail_response = await client_approval_requester.get(f"/api/v1/risks/{risk.id}")

    assert detail_response.status_code == 200
    capabilities = detail_response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_update"] is True
    assert capabilities["can_link_controls"] is False
    assert capabilities["can_unlink_controls"] is False
    assert capabilities["can_create_linked_control"] is False

    link_response = await client_approval_requester.post(
        f"/api/v1/risks/{risk.id}/controls",
        json={
            "control_id": control.id,
            "effectiveness": "high",
            "notes": "Direct risk owner should not pass risk-side link policy",
        },
    )
    assert link_response.status_code == 403


@pytest.mark.asyncio
async def test_cross_department_kri_reporting_owner_can_manage_risk_side_control_links(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    second_department: Department,
    test_department: Department,
    test_user_approval_requester: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="XDEPT-R-LINK-KRI",
        name="Cross-Dept KRI Link Allowed Risk",
        process="Cross-Dept KRI Link",
        description="Risk visible through KRI reporting ownership",
        department_id=second_department.id,
        owner_id=None,
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
    control = Control(
        name="Requester Linkable Control",
        description="Accessible control for allowed risk-side link attempt",
        department_id=test_department.id,
        control_owner_id=test_user_approval_requester.id,
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.active.value,
    )
    db_session.add_all([risk, control])
    await db_session.commit()
    await db_session.refresh(risk)
    await db_session.refresh(control)
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Cross-Dept Reporting Owner KRI",
        description="KRI grants risk-side link access",
        current_value=50.0,
        lower_limit=20.0,
        upper_limit=80.0,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user_approval_requester.id,
    )
    db_session.add(kri)
    await db_session.commit()

    detail_response = await client_approval_requester.get(f"/api/v1/risks/{risk.id}")

    assert detail_response.status_code == 200
    capabilities = detail_response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_link_controls"] is True
    assert capabilities["can_unlink_controls"] is True
    assert capabilities["can_create_linked_control"] is True

    link_response = await client_approval_requester.post(
        f"/api/v1/risks/{risk.id}/controls",
        json={
            "control_id": control.id,
            "effectiveness": "medium",
            "notes": "KRI reporting owner should pass risk-side link policy",
        },
    )
    assert link_response.status_code == 201


@pytest.mark.asyncio
async def test_archived_same_department_risk_cannot_manage_control_links(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_approval_requester: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="XDEPT-R-LINK-ARCH",
        name="Archived Link Capability Risk",
        process="Archived Link",
        description="Archived risk should not expose link actions",
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        risk_type="operational",
        category="Test",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
        is_archived=True,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    detail_response = await client_approval_requester.get(f"/api/v1/risks/{risk.id}")

    assert detail_response.status_code == 200
    capabilities = detail_response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_link_controls"] is False
    assert capabilities["can_unlink_controls"] is False
    assert capabilities["can_create_linked_control"] is False
