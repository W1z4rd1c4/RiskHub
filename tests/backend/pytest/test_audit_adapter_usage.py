from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import create_approval_request_with_audit
from app.models import (
    ActivityLog,
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    Department,
    Risk,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services.approval_execution_service import cancel_request_workflow, reject_request_workflow


async def _activity_for(
    db: AsyncSession,
    *,
    entity_type: ActivityEntityType,
    action: ActivityAction,
    entity_id: int,
) -> ActivityLog:
    result = await db.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == entity_type.value,
            ActivityLog.action == action.value,
            ActivityLog.entity_id == entity_id,
        )
    )
    entry = result.scalar_one_or_none()
    assert entry is not None
    return entry


async def _create_pending_approval(
    db: AsyncSession,
    *,
    risk: Risk,
    requester: User,
    department: Department,
    reason: str,
) -> ApprovalRequest:
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes={"name": {"old": risk.name, "new": f"{risk.name} updated"}},
        requested_by_id=requester.id,
        reason=reason,
    )
    return await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=requester,
        department_id=department.id,
    )


@pytest.mark.asyncio
async def test_approval_create_reject_cancel_activity_uses_adapter_shape(
    db_session: AsyncSession,
    test_department: Department,
    test_risk: Risk,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    created_approval = await _create_pending_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
        department=test_department,
        reason="Audit adapter create",
    )
    created_log = await _activity_for(
        db_session,
        entity_type=ActivityEntityType.APPROVAL,
        action=ActivityAction.CREATE,
        entity_id=created_approval.id,
    )
    assert created_log.entity_name == f"APPROVAL-{created_approval.id}"
    assert created_log.description == "Created edit approval request"

    rejected = await reject_request_workflow(db_session, created_approval.id, test_user_cro, "Reject audit adapter")
    rejected_log = await _activity_for(
        db_session,
        entity_type=ActivityEntityType.APPROVAL,
        action=ActivityAction.REJECT,
        entity_id=rejected.id,
    )
    assert rejected_log.entity_name == f"APPROVAL-{rejected.id}"
    assert rejected_log.description == "Rejected edit approval request"
    assert rejected_log.changes == {"status": {"old": "PENDING", "new": "REJECTED"}}

    cancelled_approval = await _create_pending_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
        department=test_department,
        reason="Audit adapter cancel",
    )
    cancelled = await cancel_request_workflow(db_session, cancelled_approval.id, test_user_employee)
    cancelled_log = await _activity_for(
        db_session,
        entity_type=ActivityEntityType.APPROVAL,
        action=ActivityAction.CANCEL,
        entity_id=cancelled.id,
    )
    assert cancelled_log.entity_name == f"APPROVAL-{cancelled.id}"
    assert cancelled_log.description == "Approval request cancelled by requester"
