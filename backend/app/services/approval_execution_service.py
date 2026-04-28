"""Approval execution service."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.approval_display import approval_resource_label
from app.models import ApprovalRequest, ApprovalStatus, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services.outbox import OutboxService

from ._approval_execution.authorization import apply_status_transition, assert_can_approve
from ._approval_execution.constants import EDITABLE_FIELDS
from ._approval_execution.loading import get_approval_department_id, load_approval
from ._approval_execution.logging import log_approval_approve
from ._approval_execution.results import apply_auto_rejection
from ._approval_execution.side_effects import apply_side_effects

__all__ = ["EDITABLE_FIELDS", "approve_request_workflow"]


async def approve_request_workflow(
    db: AsyncSession,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    """Approve a pending approval request and return the refreshed model."""
    approval = await load_approval(db, approval_id)
    is_privileged, is_primary_approver, is_scenario_approver = await assert_can_approve(db, approval, current_user)
    previous_status = approval.status

    should_apply_changes = apply_status_transition(
        approval,
        current_user=current_user,
        resolution_notes=resolution_notes,
        is_privileged=is_privileged,
        is_primary_approver=is_primary_approver,
        is_scenario_approver=is_scenario_approver,
    )

    if should_apply_changes:
        await _apply_approved_resolution(db, approval, current_user, previous_status)
    else:
        await _apply_escalation_resolution(db, approval, current_user, previous_status)

    return await _reload_approval(db, approval.id)


async def _apply_approved_resolution(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
    previous_status: ApprovalStatus,
) -> None:
    try:
        side_effect_result = await apply_side_effects(db, approval, current_user)
        apply_auto_rejection(approval, side_effect_result)

        if approval.status == ApprovalStatus.APPROVED:
            await log_approval_approve(db, approval, current_user, previous_status)

        await db.flush()
        await OutboxService.enqueue(
            db,
            event_type="approval.request_resolved",
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=f"approval.request_resolved:{approval.id}:{approval.status.value.lower()}",
            payload={"approval_id": approval.id, "approved": approval.status == ApprovalStatus.APPROVED},
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def _apply_escalation_resolution(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
    previous_status: ApprovalStatus,
) -> None:
    try:
        department_id = await get_approval_department_id(db, approval)
        await log_activity(
            db,
            entity_type=ActivityEntityType.APPROVAL,
            entity_id=approval.id,
            entity_name=approval_resource_label(approval),
            action=ActivityAction.ESCALATE,
            actor=current_user,
            department_id=department_id,
            changes={"status": {"old": previous_status.value, "new": approval.status.value}},
            description=f"Escalated to privileged approval by {current_user.name}",
        )

        await OutboxService.enqueue(
            db,
            event_type="approval.request_created",
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=f"approval.request_created:{approval.id}:{approval.status.value.lower()}",
            payload={"approval_id": approval.id},
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def _reload_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.requested_by),
            selectinload(ApprovalRequest.resolved_by),
        )
        .where(ApprovalRequest.id == approval_id)
    )
    return result.scalar_one()
