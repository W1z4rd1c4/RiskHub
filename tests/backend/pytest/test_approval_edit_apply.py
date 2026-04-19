"""Tests for approval edit application semantics.

Ensures that approval-applied edits produce the same derived fields and
audit attribution as direct updates:
- Risk: scores are recomputed when probability/impact changes
- Control: updated_by_id is set when fields are modified
- Owner reassignment targets are revalidated when approvals are applied
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.models.risk import RiskStatus
from app.services.approval_execution_service import approve_request_workflow


async def _approve_pending_edit(db_session, approval: ApprovalRequest, approver: User) -> ApprovalRequest:
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    return await approve_request_workflow(db_session, approval.id, approver, "Approved in test")


@pytest.mark.asyncio
async def test_approval_edit_risk_recomputes_gross_score(
    db_session,
    test_department,
    test_user_cro,
    test_user_employee,
):
    """Risk approval edit with gross_probability change recomputes gross_score."""
    # Create risk with known scores
    risk = Risk(
        name="Test Risk for Approval Edit",
        risk_id_code="TST-001",
        process="Test Process",
        risk_type="operational",
        description="Test description",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        gross_probability=2,
        gross_impact=3,
        gross_score=6,  # 2 * 3
        net_probability=1,
        net_impact=2,
        net_score=2,  # 1 * 2
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    # Create approval with pending change to gross_probability
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Testing score recomputation",
        status=ApprovalStatus.PENDING,
        pending_changes={
            "gross_probability": {"old": 2, "new": 4},
        },
    )
    await _approve_pending_edit(db_session, approval, test_user_cro)

    # Refresh and verify score was recomputed
    await db_session.refresh(risk)
    assert risk.gross_probability == 4
    assert risk.gross_score == 12  # 4 * 3 = 12 (recomputed)


@pytest.mark.asyncio
async def test_approval_edit_risk_recomputes_net_score(
    db_session,
    test_department,
    test_user_cro,
    test_user_employee,
):
    """Risk approval edit with net_impact change recomputes net_score."""
    risk = Risk(
        name="Test Risk Net Score",
        risk_id_code="TST-002",
        process="Test Process",
        risk_type="operational",
        description="Test description",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        gross_probability=2,
        gross_impact=2,
        gross_score=4,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Testing net score recomputation",
        status=ApprovalStatus.PENDING,
        pending_changes={
            "net_impact": {"old": 2, "new": 5},
        },
    )
    await _approve_pending_edit(db_session, approval, test_user_cro)

    await db_session.refresh(risk)
    assert risk.net_impact == 5
    assert risk.net_score == 10  # 2 * 5 = 10 (recomputed)


@pytest.mark.asyncio
async def test_approval_edit_control_sets_updated_by_id(
    db_session, test_department, test_user_cro, test_user_risk_manager
):
    """Control approval edit sets updated_by_id to approving user."""
    control = Control(
        name="Test Control for Approval Edit",
        description="Original description",
        department_id=test_department.id,
        control_owner_id=test_user_risk_manager.id,
        status="active",
        control_form="manual",
        frequency="monthly",
        updated_by_id=None,  # Not set initially
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=control.name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_risk_manager.id,
        reason="Testing updated_by_id attribution",
        status=ApprovalStatus.PENDING,
        pending_changes={
            "description": {"old": "Original description", "new": "Updated description"},
        },
    )
    await _approve_pending_edit(db_session, approval, test_user_cro)

    await db_session.refresh(control)
    assert control.description == "Updated description"
    assert control.updated_by_id == test_user_cro.id


@pytest.mark.asyncio
async def test_approval_edit_kri_auto_rejects_when_target_missing(
    db_session,
    test_user_cro,
    test_user_employee,
):
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=999999,
        resource_name="Missing KRI",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Missing target revalidation",
        status=ApprovalStatus.PENDING,
        pending_changes={
            "description": {"old": "Old", "new": "New"},
        },
    )

    resolved = await _approve_pending_edit(db_session, approval, test_user_cro)

    assert resolved.status == ApprovalStatus.REJECTED
    assert "Resource was deleted before approval could be applied" in (resolved.resolution_notes or "")


@pytest.mark.asyncio
async def test_approval_edit_risk_no_score_change_when_no_probability_impact(
    db_session,
    test_department,
    test_user_cro,
    test_user_employee,
):
    """Risk approval edit without probability/impact changes does not alter scores."""
    risk = Risk(
        name="Test Risk No Score Change",
        risk_id_code="TST-003",
        process="Test Process",
        risk_type="operational",
        description="Original",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
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

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Testing non-score field edit",
        status=ApprovalStatus.PENDING,
        pending_changes={
            "description": {"old": "Original", "new": "Updated description"},
        },
    )
    await _approve_pending_edit(db_session, approval, test_user_cro)

    await db_session.refresh(risk)
    assert risk.description == "Updated description"
    # Scores should remain unchanged
    assert risk.gross_score == 9
    assert risk.net_score == 4


@pytest.mark.asyncio
async def test_approval_edit_risk_rejects_inactive_owner_target(
    db_session,
    test_department,
    test_role_employee,
    test_user_cro,
    test_user_employee,
):
    """Risk approval edit rejects inactive owner targets at apply time."""
    risk = Risk(
        name="Risk Owner Revalidation",
        risk_id_code="TST-004",
        process="Test Process",
        risk_type="operational",
        description="Owner revalidation test",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        gross_probability=2,
        gross_impact=2,
        gross_score=4,
        net_probability=1,
        net_impact=1,
        net_score=1,
        status=RiskStatus.active.value,
    )
    inactive_owner = User(
        name="Inactive Risk Owner",
        email="inactive-risk-owner@example.com",
        role_id=test_role_employee.id,
        department_id=test_department.id,
        is_active=False,
    )
    db_session.add_all([risk, inactive_owner])
    await db_session.commit()
    await db_session.refresh(risk)
    await db_session.refresh(inactive_owner)
    expected_owner_id = test_user_cro.id

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Testing inactive owner validation",
        status=ApprovalStatus.PENDING,
        pending_changes={"owner_id": {"old": risk.owner_id, "new": inactive_owner.id}},
    )
    with pytest.raises(HTTPException) as exc_info:
        await _approve_pending_edit(db_session, approval, test_user_cro)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Risk owner is inactive"
    await db_session.refresh(risk)
    assert risk.owner_id == expected_owner_id


@pytest.mark.asyncio
async def test_approval_edit_risk_rejects_missing_owner_target(
    db_session,
    test_department,
    test_user_cro,
    test_user_employee,
):
    """Risk approval edit rejects missing owner targets at apply time."""
    risk = Risk(
        name="Risk Missing Owner Revalidation",
        risk_id_code="TST-005",
        process="Test Process",
        risk_type="operational",
        description="Owner revalidation test",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        gross_probability=2,
        gross_impact=2,
        gross_score=4,
        net_probability=1,
        net_impact=1,
        net_score=1,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    expected_owner_id = test_user_cro.id

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Testing missing owner validation",
        status=ApprovalStatus.PENDING,
        pending_changes={"owner_id": {"old": risk.owner_id, "new": 999999}},
    )
    with pytest.raises(HTTPException) as exc_info:
        await _approve_pending_edit(db_session, approval, test_user_cro)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Risk owner not found"
    await db_session.refresh(risk)
    assert risk.owner_id == expected_owner_id


@pytest.mark.asyncio
async def test_approval_edit_control_rejects_inactive_owner_target(
    db_session,
    test_department,
    test_role_employee,
    test_user_cro,
    test_user_risk_manager,
):
    """Control approval edit rejects inactive owner targets at apply time."""
    control = Control(
        name="Control Owner Revalidation",
        description="Original description",
        department_id=test_department.id,
        control_owner_id=test_user_risk_manager.id,
        status="active",
        control_form="manual",
        frequency="monthly",
    )
    inactive_owner = User(
        name="Inactive Control Owner",
        email="inactive-control-owner@example.com",
        role_id=test_role_employee.id,
        department_id=test_department.id,
        is_active=False,
    )
    db_session.add_all([control, inactive_owner])
    await db_session.commit()
    await db_session.refresh(control)
    await db_session.refresh(inactive_owner)
    expected_owner_id = test_user_risk_manager.id

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=control.name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_risk_manager.id,
        reason="Testing inactive control owner validation",
        status=ApprovalStatus.PENDING,
        pending_changes={"control_owner_id": {"old": control.control_owner_id, "new": inactive_owner.id}},
    )
    with pytest.raises(HTTPException) as exc_info:
        await _approve_pending_edit(db_session, approval, test_user_cro)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Control owner is inactive"
    await db_session.refresh(control)
    assert control.control_owner_id == expected_owner_id


@pytest.mark.asyncio
async def test_approval_edit_kri_rejects_inactive_reporting_owner_target(
    db_session,
    test_department,
    test_role_employee,
    test_user_cro,
    test_user_employee,
    test_risk,
):
    """KRI approval edit rejects inactive reporting owner targets at apply time."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="KRI Owner Revalidation",
        description="Reporting owner revalidation test",
        current_value=10.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user_cro.id,
    )
    inactive_owner = User(
        name="Inactive Reporting Owner",
        email="inactive-reporting-owner@example.com",
        role_id=test_role_employee.id,
        department_id=test_department.id,
        is_active=False,
    )
    db_session.add_all([kri, inactive_owner])
    await db_session.commit()
    await db_session.refresh(inactive_owner)
    expected_owner_id = test_user_cro.id
    kri = (
        await db_session.execute(
            select(KeyRiskIndicator)
            .options(selectinload(KeyRiskIndicator.vendor_links))
            .where(KeyRiskIndicator.id == kri.id)
        )
    ).scalar_one()

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=kri.metric_name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Testing inactive reporting owner validation",
        status=ApprovalStatus.PENDING,
        pending_changes={"reporting_owner_id": {"old": kri.reporting_owner_id, "new": inactive_owner.id}},
    )

    with pytest.raises(HTTPException) as exc_info:
        await _approve_pending_edit(db_session, approval, test_user_cro)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Reporting owner is inactive"
    await db_session.refresh(kri)
    assert kri.reporting_owner_id == expected_owner_id
