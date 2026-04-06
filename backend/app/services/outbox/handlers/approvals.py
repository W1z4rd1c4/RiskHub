"""Approval-related outbox handlers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.approval_display import approval_resource_label
from app.models import ApprovalRequest, NotificationType, User
from app.services.notification_service import NotificationService
from app.services.outbox.payloads import (
    ApprovalRequestCancelledPayload,
    ApprovalRequestCreatedPayload,
    ApprovalRequestResolvedPayload,
)


async def _load_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest | None:
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.requested_by),
            selectinload(ApprovalRequest.resolved_by),
            selectinload(ApprovalRequest.primary_approver),
        )
        .where(ApprovalRequest.id == approval_id)
    )
    return result.scalar_one_or_none()


async def handle_approval_request_created(db: AsyncSession, payload: ApprovalRequestCreatedPayload) -> None:
    approval = await _load_approval(db, payload.approval_id)
    if approval is None:
        return

    action_label = "delete" if approval.action_type.value == "delete" else "edit"
    if approval.primary_approver_id and approval.primary_approver_id != approval.requested_by_id:
        resource_label = approval_resource_label(approval)
        await NotificationService.create_notification_once(
            db=db,
            user_id=approval.primary_approver_id,
            notification_type=NotificationType.APPROVAL_PENDING,
            title=f"{approval.resource_type.value.upper()} {action_label.capitalize()} Request",
            message=f"{resource_label} requires your approval.",
            resource_type="approval",
            resource_id=approval.id,
        )

    await NotificationService.notify_approvers(db, approval)


async def handle_approval_request_resolved(db: AsyncSession, payload: ApprovalRequestResolvedPayload) -> None:
    approval = await _load_approval(db, payload.approval_id)
    if approval is None:
        return
    await NotificationService.notify_requester_resolved(db, approval, approved=payload.approved)


async def handle_approval_request_cancelled(db: AsyncSession, payload: ApprovalRequestCancelledPayload) -> None:
    approval = await _load_approval(db, payload.approval_id)
    if approval is None:
        return
    cancelled_by = await db.get(User, payload.cancelled_by_user_id)
    if cancelled_by is None:
        return
    await NotificationService.notify_approvers_cancelled(
        db=db,
        approval=approval,
        cancelled_by_user=cancelled_by,
    )
