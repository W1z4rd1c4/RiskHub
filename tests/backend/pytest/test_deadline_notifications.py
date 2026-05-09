"""Tests for shared deadline notification helpers."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services.deadline_notifications import (
    DeadlineNotificationExecutionPlan,
    create_deadline_notification,
    execute_deadline_notification_plan,
    has_recent_deadline_notification,
    increment_deadline_results,
)
from app.services.deadline_runner import run_deadline_items


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
async def test_has_recent_deadline_notification_can_scope_by_message(
    db_session: AsyncSession,
    test_user: User,
):
    now = datetime(2026, 4, 24, 12, 0, tzinfo=UTC)
    db_session.add(
        Notification(
            user_id=test_user.id,
            type=NotificationType.KRI_DUE_SOON,
            title="Prior period",
            message="KRI reporting period ends on 2026-03-31.",
            resource_type="kri",
            resource_id=103,
            created_at=now - timedelta(days=2),
        )
    )
    await db_session.commit()

    same_period = await has_recent_deadline_notification(
        db_session,
        resource_type="kri",
        resource_id=103,
        notification_type=NotificationType.KRI_DUE_SOON,
        lookback_days=7,
        now=now,
        message_contains="2026-03-31",
    )
    next_period = await has_recent_deadline_notification(
        db_session,
        resource_type="kri",
        resource_id=103,
        notification_type=NotificationType.KRI_DUE_SOON,
        lookback_days=7,
        now=now,
        message_contains="2026-04-30",
    )

    assert same_period is True
    assert next_period is False


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


@pytest.mark.asyncio
async def test_execute_deadline_notification_plan_dedupes_visibility_and_results(
    db_session: AsyncSession,
    test_user: User,
):
    now = datetime(2026, 4, 24, 12, 0, tzinfo=UTC)
    results = {"notifications_created": 0, "due_soon": 0}

    plan = DeadlineNotificationExecutionPlan(
        user_id=test_user.id,
        notification_type=NotificationType.KRI_DUE_SOON,
        title="KRI due soon",
        message="KRI is due soon for 2026-04-30.",
        resource_type="kri",
        resource_id=301,
        lookback_days=7,
        now=now,
        result_bucket="due_soon",
        message_contains="2026-04-30",
        visibility_check=lambda: _async_bool(True),
    )

    created = await execute_deadline_notification_plan(db_session, plan=plan, results=results)
    duplicate = await execute_deadline_notification_plan(db_session, plan=plan, results=results)

    notifications = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.resource_type == "kri",
                    Notification.resource_id == 301,
                )
            )
        )
        .scalars()
        .all()
    )
    assert created is True
    assert duplicate is False
    assert len(notifications) == 1
    assert results == {"notifications_created": 1, "due_soon": 1}


@pytest.mark.asyncio
async def test_run_deadline_items_isolates_item_failures_and_aggregates_counts():
    db = _FakeDeadlineSession()
    results = {"total_checked": 0, "due_soon": 0, "overdue": 0, "notifications_created": 0}

    async def process_item(item_id: int) -> dict[str, int]:
        if item_id == 2:
            raise RuntimeError("boom")
        if item_id == 1:
            return {"due_soon": 1, "notifications_created": 2}
        return {"overdue": 1, "notifications_created": 1}

    final_results = await run_deadline_items(
        db,
        items=[1, 2, 3],
        results=results,
        total_key="total_checked",
        item_label="test item",
        item_id=lambda item: item,
        process_item=process_item,
    )

    assert final_results == {
        "total_checked": 3,
        "due_soon": 1,
        "overdue": 1,
        "notifications_created": 3,
    }
    assert db.nested_entries == 3
    assert db.commits == 1


async def _async_bool(value: bool) -> bool:
    return value


class _FakeNestedTransaction:
    def __init__(self, db: "_FakeDeadlineSession") -> None:
        self._db = db

    async def __aenter__(self) -> None:
        self._db.nested_entries += 1

    async def __aexit__(self, exc_type, exc, traceback) -> bool:
        return False


class _FakeDeadlineSession:
    def __init__(self) -> None:
        self.nested_entries = 0
        self.commits = 0

    def begin_nested(self) -> _FakeNestedTransaction:
        return _FakeNestedTransaction(self)

    async def commit(self) -> None:
        self.commits += 1
