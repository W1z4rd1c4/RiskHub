"""Issue-related outbox handlers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_issue_id
from app.models import Issue, NotificationType, Permission, Role, RolePermission, User
from app.models.user import AccessScope
from app.services.notification_service import NotificationService
from app.services.outbox.handlers.common import get_active_user_with_permissions, run_notification_operation
from app.services.outbox.payloads import (
    IssueAssignedPayload,
    IssueExceptionApprovedPayload,
    IssueExceptionRequestedPayload,
)


async def _create_issue_notification(**kwargs) -> None:
    await run_notification_operation(NotificationService.create_notification(**kwargs))


async def _load_issue(db: AsyncSession, issue_id: int) -> Issue | None:
    result = await db.execute(
        select(Issue).options(selectinload(Issue.owner), selectinload(Issue.created_by)).where(Issue.id == issue_id)
    )
    return result.scalar_one_or_none()


async def handle_issue_assigned(db: AsyncSession, payload: IssueAssignedPayload) -> None:
    issue = await _load_issue(db, payload.issue_id)
    if issue is None or payload.owner_user_id == payload.actor_user_id:
        return

    recipient = await get_active_user_with_permissions(db, payload.owner_user_id)
    if recipient is None or not await can_read_issue_id(db, recipient, issue.id):
        return

    await _create_issue_notification(
        db=db,
        user_id=payload.owner_user_id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title=f"Issue assigned: {issue.title}",
        message=f"You have been assigned issue '{issue.title}'.",
        resource_type="issue",
        resource_id=issue.id,
    )


async def handle_issue_exception_requested(db: AsyncSession, payload: IssueExceptionRequestedPayload) -> None:
    issue = await _load_issue(db, payload.issue_id)
    actor = await db.get(User, payload.actor_user_id)
    if issue is None or actor is None:
        return

    permission_load = (
        select(User.id)
        .join(Role, User.role_id == Role.id)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .where(
            User.is_active.is_(True),
            User.access_scope == AccessScope.GLOBAL,
            Permission.resource.in_(("issues", "*")),
            Permission.action.in_(("approve", "*")),
        )
        .distinct()
    )
    recipient_ids = set((await db.execute(permission_load)).scalars().all())
    if issue.owner_user_id is not None:
        recipient_ids.add(issue.owner_user_id)

    for recipient_id in recipient_ids:
        if recipient_id == actor.id:
            continue
        recipient = await get_active_user_with_permissions(db, recipient_id)
        if recipient is None or not await can_read_issue_id(db, recipient, issue.id):
            continue
        await _create_issue_notification(
            db=db,
            user_id=recipient.id,
            notification_type=NotificationType.ISSUE_EXCEPTION_REQUESTED,
            title=f"Exception requested: {issue.title}",
            message=f"{actor.name} requested an exception for issue '{issue.title}'.",
            resource_type="issue",
            resource_id=issue.id,
        )


async def handle_issue_exception_approved(db: AsyncSession, payload: IssueExceptionApprovedPayload) -> None:
    issue = await _load_issue(db, payload.issue_id)
    actor = await db.get(User, payload.actor_user_id)
    if issue is None or actor is None:
        return

    recipient_ids = {
        user_id
        for user_id in (payload.requested_by_id, payload.owner_user_id)
        if user_id is not None and user_id != actor.id
    }
    for user_id in recipient_ids:
        recipient = await get_active_user_with_permissions(db, user_id)
        if recipient is None or not await can_read_issue_id(db, recipient, issue.id):
            continue
        await _create_issue_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.ISSUE_EXCEPTION_APPROVED,
            title=f"Exception approved: {issue.title}",
            message=f"An exception for issue '{issue.title}' was approved by {actor.name}.",
            resource_type="issue",
            resource_id=issue.id,
        )
