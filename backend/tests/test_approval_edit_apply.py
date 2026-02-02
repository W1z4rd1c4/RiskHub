"""Tests for approval edit application semantics.

Ensures that approval-applied edits produce the same derived fields and
audit attribution as direct updates:
- Risk: scores are recomputed when probability/impact changes
- Control: updated_by_id is set when fields are modified
"""
import pytest
from sqlalchemy import select

from app.models import (
    Risk, Control, ApprovalRequest,
    ApprovalStatus, ApprovalResourceType, ApprovalActionType,
)
from app.models.risk import RiskStatus
from app.services.approval_execution_service import _apply_edit_risk_control


@pytest.mark.asyncio
async def test_approval_edit_risk_recomputes_gross_score(db_session, test_department, test_user_cro):
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
        requested_by_id=test_user_cro.id,
        reason="Testing score recomputation",
        status=ApprovalStatus.APPROVED,
        pending_changes={
            "gross_probability": {"old": 2, "new": 4},
        },
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    # Apply the edit
    await _apply_edit_risk_control(db_session, approval, test_user_cro)
    await db_session.commit()
    
    # Refresh and verify score was recomputed
    await db_session.refresh(risk)
    assert risk.gross_probability == 4
    assert risk.gross_score == 12  # 4 * 3 = 12 (recomputed)


@pytest.mark.asyncio
async def test_approval_edit_risk_recomputes_net_score(db_session, test_department, test_user_cro):
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
        requested_by_id=test_user_cro.id,
        reason="Testing net score recomputation",
        status=ApprovalStatus.APPROVED,
        pending_changes={
            "net_impact": {"old": 2, "new": 5},
        },
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    await _apply_edit_risk_control(db_session, approval, test_user_cro)
    await db_session.commit()
    
    await db_session.refresh(risk)
    assert risk.net_impact == 5
    assert risk.net_score == 10  # 2 * 5 = 10 (recomputed)


@pytest.mark.asyncio
async def test_approval_edit_control_sets_updated_by_id(db_session, test_department, test_user_cro, test_user_risk_manager):
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
        status=ApprovalStatus.APPROVED,
        pending_changes={
            "description": {"old": "Original description", "new": "Updated description"},
        },
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    # CRO approves - their ID should be set as updated_by_id
    await _apply_edit_risk_control(db_session, approval, test_user_cro)
    await db_session.commit()
    
    await db_session.refresh(control)
    assert control.description == "Updated description"
    assert control.updated_by_id == test_user_cro.id


@pytest.mark.asyncio
async def test_approval_edit_risk_no_score_change_when_no_probability_impact(db_session, test_department, test_user_cro):
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
        requested_by_id=test_user_cro.id,
        reason="Testing non-score field edit",
        status=ApprovalStatus.APPROVED,
        pending_changes={
            "description": {"old": "Original", "new": "Updated description"},
        },
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    await _apply_edit_risk_control(db_session, approval, test_user_cro)
    await db_session.commit()
    
    await db_session.refresh(risk)
    assert risk.description == "Updated description"
    # Scores should remain unchanged
    assert risk.gross_score == 9
    assert risk.net_score == 4
