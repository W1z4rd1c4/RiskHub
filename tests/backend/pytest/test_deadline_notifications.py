"""Tests for shared deadline notification helpers."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services.deadline_notifications import (
    create_deadline_notification,
    has_recent_deadline_notification,
    increment_deadline_results,
)


@pytest.mark.asyncio
async def test_has_recent_deadline_notification_detects_recent_duplicate(
    db_session: AsyncSession,
    test_user: User,
):
    now = datetime(2026, 4, 24, 12, 0, tzinfo=UTC)
    db_session.add(
        Notification(
            user_id=test_user.id,
            type=NotificationType.KRI_OVERDUE,
            title="Recent",
            message="Recent duplicate",
            resource_type="kri",
            resource_id=101,
            created_at=now - timedelta(days=2),
        )
    )
    await db_session.commit()

    duplicate = await has_recent_deadline_notification(
        db_session,
        resource_type="kri",
        resource_id=101,
        notification_type=NotificationType.KRI_OVERDUE,
        lookback_days=7,
        now=now,
    )

    assert duplicate is True


@pytest.mark.asyncio
async def test_has_recent_deadline_notification_ignores_out_of_window_match(
    db_session: AsyncSession,
    test_user: User,
):
    now = datetime(2026, 4, 24, 12, 0, tzinfo=UTC)
    db_session.add(
        Notification(
            user_id=test_user.id,
            type=NotificationType.KRI_OVERDUE,
            title="Old",
            message="Old duplicate",
            resource_type="kri",
            resource_id=102,
            created_at=now - timedelta(days=8),
        )
    )
    await db_session.commit()

    duplicate = await has_recent_deadline_notification(
        db_session,
        resource_type="kri",
        resource_id=102,
        notification_type=NotificationType.KRI_OVERDUE,
        lookback_days=7,
        now=now,
    )

    assert duplicate is False


@pytest.mark.asyncio
async def test_create_deadline_notification_respects_visibility_gate(
    db_session: AsyncSession,
    test_user: User,
):
    created = await create_deadline_notification(
        db_session,
        user_id=test_user.id,
        notification_type=NotificationType.ISSUE_DUE_SOON,
        title="Hidden",
        message="Should not be created",
        resource_type="issue",
        resource_id=201,
        visibility_check=lambda: _async_bool(False),
    )

    notifications = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.resource_type == "issue",
                    Notification.resource_id == 201,
                )
            )
        )
        .scalars()
        .all()
    )
    assert created is False
    assert notifications == []


@pytest.mark.asyncio
async def test_create_deadline_notification_creates_visible_notification(
    db_session: AsyncSession,
    test_user: User,
):
    now = datetime(2026, 4, 24, 12, 0, tzinfo=UTC)

    created = await create_deadline_notification(
        db_session,
        user_id=test_user.id,
        notification_type=NotificationType.ISSUE_DUE_SOON,
        title="Visible",
        message="Should be created",
        resource_type="issue",
        resource_id=202,
        created_at=now,
        visibility_check=lambda: _async_bool(True),
    )

    notification = (
        await db_session.execute(
            select(Notification).where(Notification.resource_type == "issue", Notification.resource_id == 202)
        )
    ).scalar_one()
    assert created is True
    assert notification.created_at.replace(tzinfo=UTC) == now


def test_increment_deadline_results_updates_present_and_new_keys():
    results = {"notifications_created": 1}

    increment_deadline_results(results, "notifications_created", "due_soon", count=2)

    assert results == {"notifications_created": 3, "due_soon": 2}


async def _async_bool(value: bool) -> bool:
    return value
