from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc
from app.models.notification import Notification, NotificationType


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
    now_utc = coerce_utc(now)
    if now_utc is None:
        raise ValueError("now is required")
    cutoff_date = now_utc - timedelta(days=lookback_days)
    if not_before is not None:
        not_before_utc = coerce_utc(not_before)
        if not_before_utc is not None and not_before_utc > cutoff_date:
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
