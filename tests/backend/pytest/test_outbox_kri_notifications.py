from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.datetime_utils import utc_now
from app.models import KeyRiskIndicator, Notification, NotificationType, OutboxEvent, Risk, User
from app.models.key_risk_indicator import KRIFrequency
from app.services.notification_service import NotificationService
from app.services.outbox import dispatch_pending_outbox_events


def _sessionmaker(async_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


async def _create_breached_kri(
    db_session: AsyncSession,
    *,
    risk: Risk,
    reporting_owner: User,
) -> KeyRiskIndicator:
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Outbox KRI Breach",
        description="KRI used for breach outbox handler tests",
        current_value=150.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=reporting_owner.id,
    )
    db_session.add(kri)
    await db_session.flush()
    return kri


def _event_payload(kri: KeyRiskIndicator, recipient: User, *, period_end: str = "2026-04-30") -> dict[str, object]:
    return {
        "kri_id": kri.id,
        "recipient_user_id": recipient.id,
        "period_end": period_end,
        "breach_transition": "upper",
        "title": "KRI Breach Detected",
        "message": (
            f"KRI 'Outbox KRI Breach' breached limits for {period_end}! "
            "Value 150.0 exceeds upper limit 100.0"
        ),
    }


async def _add_kri_breach_event(
    db_session: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    recipient: User,
    key_suffix: str,
    period_end: str = "2026-04-30",
) -> OutboxEvent:
    event = OutboxEvent(
        event_type="kri.breach_detected",
        aggregate_type="kri",
        aggregate_id=kri.id,
        idempotency_key=f"kri.breach:{kri.id}:{period_end}:{recipient.id}:upper:{key_suffix}",
        payload=_event_payload(kri, recipient, period_end=period_end),
        status="pending",
        available_at=utc_now(),
    )
    db_session.add(event)
    await db_session.commit()
    return event


@pytest.mark.asyncio
async def test_kri_breach_outbox_handler_creates_notification(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk: Risk,
    test_user: User,
) -> None:
    kri = await _create_breached_kri(db_session, risk=test_risk, reporting_owner=test_user)
    await _add_kri_breach_event(db_session, kri=kri, recipient=test_user, key_suffix="create")

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 1

    notification = await db_session.scalar(
        select(Notification).where(
            Notification.user_id == test_user.id,
            Notification.resource_type == "kri",
            Notification.resource_id == kri.id,
            Notification.type == NotificationType.KRI_BREACH_DETECTED,
        )
    )
    assert notification is not None
    assert "breached limits" in notification.message


@pytest.mark.asyncio
async def test_kri_breach_outbox_handler_is_idempotent_for_existing_notification(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk: Risk,
    test_user: User,
) -> None:
    kri = await _create_breached_kri(db_session, risk=test_risk, reporting_owner=test_user)
    payload = _event_payload(kri, test_user)
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user.id,
        notification_type=NotificationType.KRI_BREACH_DETECTED,
        title=str(payload["title"]),
        message=str(payload["message"]),
        resource_type="kri",
        resource_id=kri.id,
    )
    await _add_kri_breach_event(db_session, kri=kri, recipient=test_user, key_suffix="replay")

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 1

    count = await db_session.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == test_user.id,
            Notification.resource_type == "kri",
            Notification.resource_id == kri.id,
            Notification.type == NotificationType.KRI_BREACH_DETECTED,
            Notification.title == payload["title"],
            Notification.message == payload["message"],
        )
    )
    assert count == 1


@pytest.mark.asyncio
async def test_kri_breach_outbox_handler_failure_is_retryable(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk: Risk,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    kri = await _create_breached_kri(db_session, risk=test_risk, reporting_owner=test_user)
    event = await _add_kri_breach_event(db_session, kri=kri, recipient=test_user, key_suffix="retry")

    async def fail_notification(*args, **kwargs):
        raise ConnectionError("kri notification store unavailable")

    monkeypatch.setattr(NotificationService, "create_notification", fail_notification)

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 0

    async with _sessionmaker(async_engine)() as read_session:
        refreshed = await read_session.get(OutboxEvent, event.id)
        assert refreshed is not None
        assert refreshed.status == "pending"
        assert refreshed.last_error == "kri notification store unavailable"


@pytest.mark.asyncio
async def test_kri_breach_outbox_handler_emits_distinct_notifications_for_distinct_periods(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk: Risk,
    test_user: User,
) -> None:
    kri = await _create_breached_kri(db_session, risk=test_risk, reporting_owner=test_user)
    await _add_kri_breach_event(
        db_session,
        kri=kri,
        recipient=test_user,
        key_suffix="april",
        period_end="2026-04-30",
    )
    await _add_kri_breach_event(
        db_session,
        kri=kri,
        recipient=test_user,
        key_suffix="may",
        period_end="2026-05-31",
    )

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 2

    messages = (
        (
            await db_session.execute(
                select(Notification.message).where(
                    Notification.user_id == test_user.id,
                    Notification.resource_type == "kri",
                    Notification.resource_id == kri.id,
                    Notification.type == NotificationType.KRI_BREACH_DETECTED,
                )
            )
        )
        .scalars()
        .all()
    )
    assert sorted(messages) == [
        "KRI 'Outbox KRI Breach' breached limits for 2026-04-30! Value 150.0 exceeds upper limit 100.0",
        "KRI 'Outbox KRI Breach' breached limits for 2026-05-31! Value 150.0 exceeds upper limit 100.0",
    ]
    count = await db_session.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == test_user.id,
            Notification.resource_type == "kri",
            Notification.resource_id == kri.id,
            Notification.type == NotificationType.KRI_BREACH_DETECTED,
        )
    )
    assert count == 2
