"""Shared mechanics for deadline-driven notification services."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc
from app.models.notification import Notification, NotificationType
from app.services.notification_service import NotificationService

VisibilityCheck = Callable[[], Awaitable[bool]]


@dataclass(frozen=True)
class DeadlineNotificationExecutionPlan:
    """Declarative deadline notification work with optional dedupe and result accounting."""

    user_id: int
    notification_type: NotificationType
    title: str
    message: str
    resource_type: str
    resource_id: int
    now: datetime
    lookback_days: int | None = None
    not_before: datetime | None = None
    message_contains: str | None = None
    visibility_check: VisibilityCheck | None = None
    result_bucket: str | None = None


async def has_recent_deadline_notification(
    db: AsyncSession,
    *,
    resource_type: str,
    resource_id: int,
    notification_type: NotificationType,
    lookback_days: int,
    now: datetime,
    not_before: datetime | None = None,
    message_contains: str | None = None,
) -> bool:
    """Return whether an equivalent deadline notification exists in the lookback window."""
    cutoff_date = coerce_utc(now) - timedelta(days=lookback_days)
    if not_before is not None:
        not_before_utc = coerce_utc(not_before)
        if not_before_utc > cutoff_date:
            cutoff_date = not_before_utc
    stmt = (
        select(Notification)
        .where(
            and_(
                Notification.resource_type == resource_type,
                Notification.resource_id == resource_id,
                Notification.type == notification_type,
                Notification.created_at >= cutoff_date,
            )
        )
        .limit(1)
    )
    if message_contains is not None:
        stmt = stmt.where(Notification.message.contains(message_contains))
    existing = (await db.execute(stmt)).scalar_one_or_none()
    return existing is not None


async def create_deadline_notification(
    db: AsyncSession,
    *,
    user_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    resource_type: str,
    resource_id: int,
    created_at: datetime | None = None,
    visibility_check: VisibilityCheck | None = None,
) -> bool:
    """Create a notification when the optional visibility gate allows it."""
    if visibility_check is not None and not await visibility_check():
        return False

    created = await NotificationService.create_notification(
        db=db,
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        resource_type=resource_type,
        resource_id=resource_id,
        created_at=created_at,
    )
    return created is not None


def increment_deadline_results(results: dict[str, int], *keys: str, count: int = 1) -> None:
    """Increment deadline result counters that are present in the result mapping."""
    for key in keys:
        results[key] = results.get(key, 0) + count


async def execute_deadline_notification_plan(
    db: AsyncSession,
    *,
    plan: DeadlineNotificationExecutionPlan,
    results: dict[str, int] | None = None,
) -> bool:
    """Execute one deadline notification plan with dedupe, visibility, creation, and counters."""
    if plan.lookback_days is not None and await has_recent_deadline_notification(
        db,
        resource_type=plan.resource_type,
        resource_id=plan.resource_id,
        notification_type=plan.notification_type,
        lookback_days=plan.lookback_days,
        now=plan.now,
        not_before=plan.not_before,
        message_contains=plan.message_contains,
    ):
        return False

    created = await create_deadline_notification(
        db,
        user_id=plan.user_id,
        notification_type=plan.notification_type,
        title=plan.title,
        message=plan.message,
        resource_type=plan.resource_type,
        resource_id=plan.resource_id,
        created_at=plan.now,
        visibility_check=plan.visibility_check,
    )
    if created and results is not None:
        result_keys = ("notifications_created",)
        if plan.result_bucket is not None:
            result_keys = (*result_keys, plan.result_bucket)
        increment_deadline_results(results, *result_keys)
    return created
