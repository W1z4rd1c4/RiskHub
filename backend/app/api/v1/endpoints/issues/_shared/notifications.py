from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_issue_id
from app.models import Issue, Permission, Role, RolePermission, User
from app.models.notification import NotificationType
from app.models.user import AccessScope
from app.services.notification_service import NotificationService


async def _get_active_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    return (
        await db.execute(
            select(User)
            .options(
                selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            )
            .where(User.id == user_id, User.is_active.is_(True))
        )
    ).scalar_one_or_none()


async def _notify_issue_assigned(db: AsyncSession, *, issue: Issue, owner_user_id: int, actor: User) -> None:
    if owner_user_id == actor.id:
        return
    recipient = await _get_active_user_with_permissions(db, owner_user_id)
    if recipient is None:
        return
    if not await can_read_issue_id(db, recipient, issue.id):
        return
    await NotificationService.create_notification(
        db=db,
        user_id=owner_user_id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title=f"Issue assigned: {issue.title}",
        message=f"You have been assigned issue '{issue.title}'.",
        resource_type="issue",
        resource_id=issue.id,
    )


async def _notify_exception_requested(db: AsyncSession, *, issue: Issue, actor: User) -> None:
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
        recipient = await _get_active_user_with_permissions(db, recipient_id)
        if recipient is None:
            continue
        if not await can_read_issue_id(db, recipient, issue.id):
            continue
        await NotificationService.create_notification(
            db=db,
            user_id=recipient.id,
            notification_type=NotificationType.ISSUE_EXCEPTION_REQUESTED,
            title=f"Exception requested: {issue.title}",
            message=f"{actor.name} requested an exception for issue '{issue.title}'.",
            resource_type="issue",
            resource_id=issue.id,
        )


async def _notify_exception_approved(
    db: AsyncSession,
    *,
    issue: Issue,
    requested_by_id: int | None,
    owner_user_id: int | None,
    actor: User,
) -> None:
    recipient_ids = {uid for uid in (requested_by_id, owner_user_id) if uid and uid != actor.id}
    for user_id in recipient_ids:
        recipient = await _get_active_user_with_permissions(db, user_id)
        if recipient is None:
            continue
        if not await can_read_issue_id(db, recipient, issue.id):
            continue
        await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.ISSUE_EXCEPTION_APPROVED,
            title=f"Exception approved: {issue.title}",
            message=f"An exception for issue '{issue.title}' was approved by {actor.name}.",
            resource_type="issue",
            resource_id=issue.id,
        )

