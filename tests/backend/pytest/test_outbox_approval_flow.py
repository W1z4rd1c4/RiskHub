from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.datetime_utils import coerce_utc, utc_now
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    KeyRiskIndicator,
    Notification,
    OutboxEvent,
    Risk,
    User,
)
from app.models.key_risk_indicator import KRIFrequency
from app.models.kri_history import KRIValueHistory
from app.models.notification import NotificationType
from app.models.user import AccessScope
from app.services.kri_history_service import KRIHistoryService
from app.services.notification_service import NotificationService
from app.services.outbox import dispatch_pending_outbox_events
from app.services.outbox.errors import FatalOutboxError, RetryableOutboxError
from app.services.outbox.payloads import OUTBOX_PAYLOAD_MODELS
from app.services.outbox.registry import OUTBOX_EVENT_HANDLERS
from app.services.outbox.store import OUTBOX_RECLAIM_AFTER, OutboxService


def _sessionmaker(async_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


async def _create_outbox_risk(
    db_session: AsyncSession,
    *,
    risk_id_code: str,
    department_id: int,
    owner_id: int,
) -> Risk:
    risk = Risk(
        risk_id_code=risk_id_code,
        name="Outbox Queue Risk",
        process="Outbox Test",
        description="Risk used for approval outbox notification tests",
        department_id=department_id,
        owner_id=owner_id,
        risk_type="operational",
        category="Testing",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=3,
        net_impact=4,
        net_score=10,
        status="active",
        is_priority=False,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


@pytest.mark.asyncio
async def test_create_approval_request_enqueues_outbox_without_inline_notifications(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk,
) -> None:
    response = await client_approval_requester.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Outbox flow"},
    )
    assert response.status_code == 201, response.text
    approval_id = response.json()["id"]

    notifications = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.resource_type == "approval",
                    Notification.resource_id == approval_id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert notifications == []

    outbox_rows = (
        (
            await db_session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_id == approval_id,
                    OutboxEvent.event_type == "approval.request_created",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(outbox_rows) == 1
    assert outbox_rows[0].status == "pending"

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 1

    delivered = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.resource_type == "approval",
                    Notification.resource_id == approval_id,
                    Notification.type == NotificationType.APPROVAL_PENDING,
                )
            )
        )
        .scalars()
        .all()
    )
    assert delivered


@pytest.mark.asyncio
async def test_queue_created_approval_notifies_primary_approver_after_dispatch(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_department,
    test_user_employee: User,
) -> None:
    risk = await _create_outbox_risk(
        db_session,
        risk_id_code="OUTBOX-QUEUE-001",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
    )

    response = await client_approval_requester.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": risk.id, "reason": "Notify primary approver"},
    )
    assert response.status_code == 201, response.text
    approval_id = response.json()["id"]

    primary_inline = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_employee.id,
                Notification.resource_type == "approval",
                Notification.resource_id == approval_id,
                Notification.type == NotificationType.APPROVAL_PENDING,
            )
        )
    ).scalar_one_or_none()
    assert primary_inline is None

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed >= 1

    primary_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_employee.id,
                Notification.resource_type == "approval",
                Notification.resource_id == approval_id,
                Notification.type == NotificationType.APPROVAL_PENDING,
            )
        )
    ).scalar_one_or_none()
    assert primary_notification is not None


@pytest.mark.asyncio
async def test_scenario_approval_notification_supports_manager_scoped_approver(
    db_session: AsyncSession,
    test_department,
    test_role_risk_manager,
    test_user_cro: User,
) -> None:
    role_id = test_role_risk_manager.id
    manager_id = test_user_cro.id
    department_id = test_department.id
    approver = User(
        name="Manager Scoped Scenario Approver",
        email="manager.scoped.scenario.approver@test.com",
        department_id=None,
        manager_id=manager_id,
        role_id=role_id,
        is_active=True,
        access_scope=AccessScope.MANAGER,
    )
    db_session.add(approver)
    await db_session.flush()

    risk = await _create_outbox_risk(
        db_session,
        risk_id_code="OUTBOX-SCENARIO-MANAGER-001",
        department_id=department_id,
        owner_id=manager_id,
    )
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        requested_by_id=manager_id,
        reason="Manager-scoped scenario approval notification",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"name": {"old": risk.name, "new": "Updated"}},
        status=ApprovalStatus.PENDING,
        scenario_approver_roles=["risk_manager"],
    )
    db_session.add(approval)
    await db_session.commit()
    approver_id = approver.id
    approval_id = approval.id
    db_session.expunge_all()
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None

    created = await NotificationService.notify_approvers(db_session, approval)

    assert any(notification.user_id == approver_id for notification in created)
    notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == approver_id,
                Notification.resource_type == "approval",
                Notification.resource_id == approval_id,
                Notification.type == NotificationType.APPROVAL_PENDING,
            )
        )
    ).scalar_one_or_none()
    assert notification is not None


@pytest.mark.asyncio
async def test_outbox_unknown_event_dead_letters_immediately(
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
        assert refreshed.status == "dead_letter"
        assert refreshed.last_error == "Unknown outbox event type: unknown.event"


@pytest.mark.asyncio
async def test_invalid_outbox_payload_dead_letters_immediately(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
) -> None:
    event = OutboxEvent(
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=1,
        idempotency_key="approval.request_created:1:invalid",
        payload={"unexpected": True},
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
        assert refreshed.status == "dead_letter"
        assert refreshed.last_error is not None
        assert "Invalid outbox payload for approval.request_created" in refreshed.last_error


@pytest.mark.asyncio
async def test_outbox_registry_covers_all_typed_payload_models() -> None:
    assert set(OUTBOX_EVENT_HANDLERS) == set(OUTBOX_PAYLOAD_MODELS)


@pytest.mark.asyncio
async def test_retryable_outbox_handler_failure_marks_retry(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event = OutboxEvent(
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=1,
        idempotency_key="approval.request_created:retryable",
        payload={"approval_id": 1},
        status="pending",
        available_at=utc_now(),
    )
    db_session.add(event)
    await db_session.commit()

    async def retryable_handler(_db: AsyncSession, _payload) -> None:
        raise RetryableOutboxError("temporary notification outage")

    import app.services.outbox.dispatcher as dispatcher_module

    monkeypatch.setitem(dispatcher_module.OUTBOX_EVENT_HANDLERS, event.event_type, retryable_handler)

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 0

    async with _sessionmaker(async_engine)() as read_session:
        refreshed = await read_session.get(OutboxEvent, event.id)
        assert refreshed is not None
        assert refreshed.status == "pending"
        assert refreshed.last_error == "temporary notification outage"
        assert coerce_utc(refreshed.available_at) > coerce_utc(event.available_at)


@pytest.mark.asyncio
async def test_fatal_outbox_handler_failure_dead_letters(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event = OutboxEvent(
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=1,
        idempotency_key="approval.request_created:fatal",
        payload={"approval_id": 1},
        status="pending",
        available_at=utc_now(),
    )
    db_session.add(event)
    await db_session.commit()

    async def fatal_handler(_db: AsyncSession, _payload) -> None:
        raise FatalOutboxError("approval target is no longer valid")

    import app.services.outbox.dispatcher as dispatcher_module

    monkeypatch.setitem(dispatcher_module.OUTBOX_EVENT_HANDLERS, event.event_type, fatal_handler)

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 0

    async with _sessionmaker(async_engine)() as read_session:
        refreshed = await read_session.get(OutboxEvent, event.id)
        assert refreshed is not None
        assert refreshed.status == "dead_letter"
        assert refreshed.last_error == "approval target is no longer valid"


@pytest.mark.asyncio
async def test_unclassified_outbox_handler_failure_dead_letters(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event = OutboxEvent(
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=1,
        idempotency_key="approval.request_created:unclassified",
        payload={"approval_id": 1},
        status="pending",
        available_at=utc_now(),
    )
    db_session.add(event)
    await db_session.commit()

    async def unclassified_handler(_db: AsyncSession, _payload) -> None:
        raise RuntimeError("unexpected handler bug")

    import app.services.outbox.dispatcher as dispatcher_module

    monkeypatch.setitem(dispatcher_module.OUTBOX_EVENT_HANDLERS, event.event_type, unclassified_handler)

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed == 0

    async with _sessionmaker(async_engine)() as read_session:
        refreshed = await read_session.get(OutboxEvent, event.id)
        assert refreshed is not None
        assert refreshed.status == "dead_letter"
        assert refreshed.last_error == "unexpected handler bug"


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_claim_batch_skips_locked_rows(async_engine: AsyncEngine) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL-specific lock semantics test")

    sessionmaker = _sessionmaker(async_engine)
    async with sessionmaker() as seed_session:
        event = OutboxEvent(
            event_type="approval.request_created",
            aggregate_type="approval_request",
            aggregate_id=1,
            idempotency_key="approval.request_created:postgres-lock-test",
            payload={"approval_id": 1},
            status="pending",
            available_at=utc_now(),
        )
        seed_session.add(event)
        await seed_session.commit()

    async with sessionmaker() as first_session:
        await first_session.begin()
        now = utc_now()
        first_claim = await OutboxService._claim_batch_postgres(
            first_session,
            batch_size=1,
            lock_owner="worker-1",
            now=now,
            reclaim_before=now - OUTBOX_RECLAIM_AFTER,
        )
        assert first_claim == [event.id]

        async with sessionmaker() as second_session:
            second_claim = await OutboxService.claim_batch(
                second_session,
                batch_size=1,
                lock_owner="worker-2",
            )

        assert second_claim == []
        await first_session.commit()


@pytest.mark.asyncio
async def test_reject_approval_enqueues_resolution_outbox_and_dispatch_notifies_requester(
    client_approval_requester: AsyncClient,
    client_risk_manager: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk,
    test_user_approval_requester: User,
) -> None:
    create_response = await client_approval_requester.post(
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
        (
            await db_session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_id == approval_id,
                    OutboxEvent.event_type == "approval.request_resolved",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(pending_resolution) == 1
    assert pending_resolution[0].status == "pending"

    requester_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_approval_requester.id,
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
                Notification.user_id == test_user_approval_requester.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval_id,
            )
        )
    ).scalar_one_or_none()
    assert requester_notification is not None


@pytest.mark.asyncio
async def test_auto_rejected_history_correction_enqueues_resolution_outbox_and_notifies_requester(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk,
    test_user: User,
    test_user_approval_requester: User,
) -> None:
    period_start, period_end = KRIHistoryService.latest_closed_period_for_date(date.today(), KRIFrequency.monthly.value)
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Outbox Auto Reject KRI",
        description="KRI used for auto-rejected history correction outbox tests",
        current_value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        last_period_end=period_end,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    history_entry = KRIValueHistory(
        kri_id=kri.id,
        period_start=period_start,
        period_end=period_end,
        recorded_at=datetime.now(UTC),
        recorded_by_id=test_user.id,
        value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history_entry)
    await db_session.commit()
    await db_session.refresh(history_entry)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name="Outbox Auto Reject KRI (history correction)",
        requested_by_id=test_user_approval_requester.id,
        reason="Correction became stale",
        action_type=ApprovalActionType.EDIT,
        pending_changes={
            "history_entry_id": history_entry.id,
            "old_value": 45.0,
            "new_value": 60.0,
            "reason": "Fix stale value",
            "period_end": period_end.isoformat(),
        },
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    history_entry.value = 50.0
    kri.current_value = 50.0
    await db_session.commit()

    response = await client_cro.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve stale correction"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"

    pending_resolution = (
        (
            await db_session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_id == approval.id,
                    OutboxEvent.event_type == "approval.request_resolved",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(pending_resolution) == 1
    assert pending_resolution[0].status == "pending"
    assert pending_resolution[0].payload["approved"] is False

    requester_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_approval_requester.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval.id,
            )
        )
    ).scalar_one_or_none()
    assert requester_notification is None

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed >= 1

    requester_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_approval_requester.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval.id,
            )
        )
    ).scalar_one_or_none()
    assert requester_notification is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "resource_type",
    [
        ApprovalResourceType.RISK,
        ApprovalResourceType.CONTROL,
        ApprovalResourceType.KRI,
    ],
)
async def test_missing_delete_target_enqueues_resolution_outbox_with_approved_false(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    resource_type: ApprovalResourceType,
    test_user_approval_requester: User,
) -> None:
    approval = ApprovalRequest(
        resource_type=resource_type,
        resource_id=999999,
        resource_name=f"Missing {resource_type.value}",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user_approval_requester.id,
        reason="Missing target auto-reject outbox parity",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    response = await client_cro.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve missing target"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"

    pending_resolution = (
        (
            await db_session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_id == approval.id,
                    OutboxEvent.event_type == "approval.request_resolved",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(pending_resolution) == 1
    assert pending_resolution[0].status == "pending"
    assert pending_resolution[0].payload["approved"] is False


@pytest.mark.asyncio
async def test_cancel_approval_enqueues_outbox_without_inline_cancellation_notifications(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_risk,
) -> None:
    create_response = await client_approval_requester.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Cancel me"},
    )
    assert create_response.status_code == 201, create_response.text
    approval_id = create_response.json()["id"]

    cancel_response = await client_approval_requester.post(f"/api/v1/approvals/{approval_id}/cancel")
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
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.resource_id == approval_id,
                    Notification.type == NotificationType.APPROVAL_CANCELLED,
                )
            )
        )
        .scalars()
        .all()
    )
    assert inline_notifications == []

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
    assert processed >= 1
