"""Approval execution service."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.approval_display import approval_resource_label
from app.core.datetime_utils import utc_now
from app.core.permissions import can_resolve_approvals
from app.models import ApprovalRequest, ApprovalStatus, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services.approval_scenario_policy import (
    can_view_approval_resource,
    scenario_allows_privileged_resolution,
    user_matches_approval_scenario_role,
)
from app.services.outbox import OutboxService

from ._approval_execution.authorization import apply_status_transition, assert_can_approve
from ._approval_execution.constants import EDITABLE_FIELDS
from ._approval_execution.loading import get_approval_department_id, load_approval
from ._approval_execution.logging import log_approval_approve
from ._approval_execution.resolution import (
    approval_cancelled_event_plan,
    approval_escalated_event_plan,
    approval_resolved_event_plan,
    finalize_approval_resolution_plan,
)
from ._approval_execution.results import apply_auto_rejection
from ._approval_execution.side_effects import apply_side_effects

__all__ = ["EDITABLE_FIELDS", "approve_request_workflow", "cancel_request_workflow", "reject_request_workflow"]


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


async def reject_request_workflow(
    db: AsyncSession,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    """Reject a pending approval request and return the refreshed model."""
    approval = await load_approval(db, approval_id)
    await _assert_can_reject(db, approval, current_user)
    previous_status = approval.status

    async def apply_rejection() -> None:
        approval.status = ApprovalStatus.REJECTED
        approval.resolved_by_id = current_user.id
        approval.resolved_at = utc_now()
        approval.resolution_notes = resolution_notes

        department_id = await get_approval_department_id(db, approval)
        await log_activity(
            db,
            entity_type=ActivityEntityType.APPROVAL,
            entity_id=approval.id,
            entity_name=approval_resource_label(approval),
            action=ActivityAction.REJECT,
            actor=current_user,
            department_id=department_id,
            changes={"status": {"old": previous_status.value, "new": approval.status.value}},
        )

    await finalize_approval_resolution_plan(
        db,
        approval=approval,
        plan=approval_resolved_event_plan(approval),
        before_commit=apply_rejection,
        outbox_service=OutboxService,
    )

    return await _reload_approval(db, approval.id)


async def cancel_request_workflow(
    db: AsyncSession,
    approval_id: int,
    current_user: User,
) -> ApprovalRequest:
    """Cancel a pending approval request and return the refreshed model."""
    approval = await load_approval(db, approval_id)

    is_requester = approval.requested_by_id == current_user.id
    is_privileged = can_resolve_approvals(current_user)
    if not is_requester and not is_privileged:
        raise HTTPException(status_code=403, detail="Only the requester or approval resolvers can cancel requests")

    if approval.status not in (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED):
        raise HTTPException(status_code=400, detail=f"Cannot cancel request with status: {approval.status.value}")

    async def apply_cancellation() -> None:
        approval.status = ApprovalStatus.CANCELLED
        approval.resolved_by_id = current_user.id
        approval.resolved_at = utc_now()

        department_id = await get_approval_department_id(db, approval)
        cancel_description = (
            "Approval request cancelled by requester"
            if is_requester
            else f"Approval request cancelled by {current_user.name} (privileged)"
        )
        await log_activity(
            db,
            entity_type=ActivityEntityType.APPROVAL,
            entity_id=approval.id,
            entity_name=approval_resource_label(approval),
            action=ActivityAction.CANCEL,
            actor=current_user,
            department_id=department_id,
            safe_description=cancel_description,
            safe_description_siem=(
                "Approval request cancelled by requester"
                if is_requester
                else "Approval request cancelled by privileged user"
            ),
            description=cancel_description,
        )

    await finalize_approval_resolution_plan(
        db,
        approval=approval,
        plan=approval_cancelled_event_plan(approval, cancelled_by_user_id=current_user.id),
        before_commit=apply_cancellation,
        outbox_service=OutboxService,
    )

    return await _reload_approval(db, approval.id)


async def _apply_approved_resolution(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
    previous_status: ApprovalStatus,
) -> None:
    async def apply_approval() -> None:
        side_effect_result = await apply_side_effects(db, approval, current_user)
        apply_auto_rejection(approval, side_effect_result)

        if approval.status == ApprovalStatus.APPROVED:
            await log_approval_approve(db, approval, current_user, previous_status)

        await db.flush()

    await finalize_approval_resolution_plan(
        db,
        approval=approval,
        plan=approval_resolved_event_plan(approval),
        before_commit=apply_approval,
        outbox_service=OutboxService,
    )


async def _apply_escalation_resolution(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
    previous_status: ApprovalStatus,
) -> None:
    async def apply_escalation() -> None:
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

    await finalize_approval_resolution_plan(
        db,
        approval=approval,
        plan=approval_escalated_event_plan(approval),
        before_commit=apply_escalation,
        outbox_service=OutboxService,
    )


async def _assert_can_reject(db: AsyncSession, approval: ApprovalRequest, current_user: User) -> None:
    if approval.status not in (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED):
        raise HTTPException(status_code=400, detail=f"Cannot reject request with status: {approval.status.value}")

    scenario_match = user_matches_approval_scenario_role(approval, current_user)
    privileged_scenario_match = scenario_allows_privileged_resolution(approval, current_user)
    if scenario_match is None:
        if not can_resolve_approvals(current_user):
            raise HTTPException(status_code=403, detail="Only authorized approval resolvers can reject requests")
    elif approval.requested_by_id == current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Requesters must cancel their own approval requests instead of rejecting them",
        )
    elif approval.status == ApprovalStatus.PENDING:
        if not scenario_match:
            raise HTTPException(
                status_code=403,
                detail="This approval scenario does not allow your role to reject this request",
            )
        if not can_resolve_approvals(current_user) and not await can_view_approval_resource(db, current_user, approval):
            raise HTTPException(status_code=403, detail="Access denied")
    elif not can_resolve_approvals(current_user) or privileged_scenario_match is not True:
        raise HTTPException(status_code=403, detail="This request requires approval-resolution authority")


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
