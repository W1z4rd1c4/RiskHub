from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.notification import Notification
from app.schemas.notification import (
    NotificationPreferences,
    NotificationPreferencesUpdate,
    NotificationRead,
    NotificationTypeEnum,
)
from app.services.notification_visibility import count_visible_unread_notifications, paginate_visible_notifications


@dataclass(frozen=True)
class NotificationInboxOptions:
    actor: User
    unread_only: bool
    offset: int
    limit: int


@dataclass(frozen=True)
class NotificationInboxPage:
    items: list[NotificationRead]
    total: int
    unread_count: int
    offset: int
    limit: int


@dataclass(frozen=True)
class NotificationReadOutcome:
    notification_id: int | None
    unread_count: int | None = None


@dataclass(frozen=True)
class NotificationPreferenceOutcome:
    preferences: NotificationPreferences


def _build_notification_read(notification: Notification) -> NotificationRead:
    return NotificationRead(
        id=notification.id,
        type=NotificationTypeEnum(notification.type.value),
        title=notification.title,
        message=notification.message,
        resource_type=notification.resource_type,
        resource_id=notification.resource_id,
        is_read=notification.is_read,
        created_at=notification.created_at,
        expires_at=notification.expires_at,
    )


async def list_notification_inbox(
    db: AsyncSession,
    options: NotificationInboxOptions,
) -> NotificationInboxPage:
    notifications, total, unread_count = await paginate_visible_notifications(
        db,
        options.actor,
        skip=options.offset,
        limit=options.limit,
        unread_only=options.unread_only,
    )
    return NotificationInboxPage(
        items=[_build_notification_read(notification) for notification in notifications],
        total=total,
        unread_count=unread_count,
        offset=options.offset,
        limit=options.limit,
    )


async def count_notification_inbox_unread(db: AsyncSession, actor: User) -> int:
    return await count_visible_unread_notifications(db, actor)


def read_notification_preferences(actor: User) -> NotificationPreferenceOutcome:
    prefs = actor.notification_preferences or {}
    defaults = NotificationPreferences()
    return NotificationPreferenceOutcome(
        preferences=NotificationPreferences(**{**defaults.model_dump(), **prefs})
    )


async def update_notification_preferences(
    db: AsyncSession,
    *,
    actor: User,
    preferences: NotificationPreferencesUpdate,
) -> NotificationPreferenceOutcome:
    existing = actor.notification_preferences or {}
    updates = {key: value for key, value in preferences.model_dump().items() if value is not None}
    new_prefs = {**existing, **updates}

    actor.notification_preferences = new_prefs
    await db.commit()

    defaults = NotificationPreferences()
    return NotificationPreferenceOutcome(
        preferences=NotificationPreferences(**{**defaults.model_dump(), **new_prefs})
    )


async def mark_notification_read(
    db: AsyncSession,
    *,
    notification_id: int,
    actor: User,
) -> NotificationReadOutcome:
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()

    if not notification or notification.user_id != actor.id:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    await db.commit()
    unread_count = await count_visible_unread_notifications(db, actor)
    return NotificationReadOutcome(notification_id=notification.id, unread_count=unread_count)


async def mark_all_notifications_read(db: AsyncSession, actor: User) -> NotificationReadOutcome:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == actor.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return NotificationReadOutcome(notification_id=None)
