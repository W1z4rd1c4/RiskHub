from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.datetime_utils import utc_now
from app.models import Notification, OutboxEvent, User
from app.models.notification import NotificationType
from app.services.outbox_service import OUTBOX_MAX_ATTEMPTS, dispatch_pending_outbox_events


def _sessionmaker(async_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.mark.asyncio
async def test_create_approval_request_enqueues_outbox_without_inline_notifications(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk,
) -> None:
    response = await client_employee.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Outbox flow"},
    )
    assert response.status_code == 201, response.text
    approval_id = response.json()["id"]

    notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.resource_type == "approval",
                Notification.resource_id == approval_id,
            )
        )
    ).scalars().all()
    assert notifications == []

    outbox_rows = (
        await db_session.execute(
            select(OutboxEvent).where(
                OutboxEvent.aggregate_id == approval_id,
                OutboxEvent.event_type == "approval.request_created",
            )
        )
    ).scalars().all()
    assert len(outbox_rows) == 1
    assert outbox_rows[0].status == "pending"

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 1

    delivered = (
        await db_session.execute(
            select(Notification).where(
                Notification.resource_type == "approval",
                Notification.resource_id == approval_id,
                Notification.type == NotificationType.APPROVAL_PENDING,
            )
        )
    ).scalars().all()
    assert delivered


@pytest.mark.asyncio
async def test_outbox_unknown_event_retries_then_dead_letters(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
) -> None:
    event = OutboxEvent(
        event_type="unknown.event",
        aggregate_type="test",
        aggregate_id=1,
        idempotency_key="unknown.event:1",
        payload={"value": 1},
        status="pending",
        available_at=utc_now(),
    )
    db_session.add(event)
    await db_session.commit()

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 0

    async with _sessionmaker(async_engine)() as read_session:
        refreshed = await read_session.get(OutboxEvent, event.id)
        assert refreshed is not None
        assert refreshed.status == "pending"
        assert refreshed.last_error == "Unknown outbox event: unknown.event"

    event.attempt_count = OUTBOX_MAX_ATTEMPTS - 1
    event.available_at = utc_now()
    db_session.add(event)
    await db_session.commit()

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 0

    async with _sessionmaker(async_engine)() as read_session:
        dead_letter = await read_session.get(OutboxEvent, event.id)
        assert dead_letter is not None
        assert dead_letter.status == "dead_letter"


@pytest.mark.asyncio
async def test_reject_approval_enqueues_resolution_outbox_and_dispatch_notifies_requester(
    client_employee: AsyncClient,
    client_risk_manager: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk,
    test_user_employee: User,
) -> None:
    create_response = await client_employee.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Please reject"},
    )
    assert create_response.status_code == 201, create_response.text
    approval_id = create_response.json()["id"]

    reject_response = await client_risk_manager.post(
        f"/api/v1/approvals/{approval_id}/reject",
        json={"resolution_notes": "Rejected via outbox"},
    )
    assert reject_response.status_code == 200, reject_response.text

    pending_resolution = (
        await db_session.execute(
            select(OutboxEvent).where(
                OutboxEvent.aggregate_id == approval_id,
                OutboxEvent.event_type == "approval.request_resolved",
            )
        )
    ).scalars().all()
    assert len(pending_resolution) == 1
    assert pending_resolution[0].status == "pending"

    requester_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_employee.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval_id,
            )
        )
    ).scalar_one_or_none()
    assert requester_notification is None

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed >= 1

    requester_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_employee.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval_id,
            )
        )
    ).scalar_one_or_none()
    assert requester_notification is not None


@pytest.mark.asyncio
async def test_cancel_approval_enqueues_outbox_without_inline_cancellation_notifications(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk,
) -> None:
    create_response = await client_employee.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Cancel me"},
    )
    assert create_response.status_code == 201, create_response.text
    approval_id = create_response.json()["id"]

    cancel_response = await client_employee.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert cancel_response.status_code == 200, cancel_response.text

    outbox_row = (
        await db_session.execute(
            select(OutboxEvent).where(
                OutboxEvent.aggregate_id == approval_id,
                OutboxEvent.event_type == "approval.request_cancelled",
            )
        )
    ).scalar_one_or_none()
    assert outbox_row is not None
    assert outbox_row.status == "pending"

    inline_notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.resource_id == approval_id,
                Notification.type == NotificationType.APPROVAL_CANCELLED,
            )
        )
    ).scalars().all()
    assert inline_notifications == []

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed >= 1
