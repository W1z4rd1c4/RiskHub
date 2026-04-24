"""Shared mechanics for deadline-driven notification services."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.services.notification_service import NotificationService

VisibilityCheck = Callable[[], Awaitable[bool]]


async def has_recent_deadline_notification(
    db: AsyncSession,
    *,
    resource_type: str,
    resource_id: int,
    notification_type: NotificationType,
    lookback_days: int,
    now: datetime,
) -> bool:
    """Return whether an equivalent deadline notification exists in the lookback window."""
    cutoff_date = now - timedelta(days=lookback_days)
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
