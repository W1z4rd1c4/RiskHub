"""Persistence primitives for transactional outbox operations."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import OutboxEvent
from app.services.outbox.payloads import OutboxPayloadModel, validate_outbox_payload

OUTBOX_DISPATCH_INTERVAL_SECONDS = 5
OUTBOX_BATCH_SIZE = 50
OUTBOX_MAX_ATTEMPTS = 10
OUTBOX_RECLAIM_AFTER = timedelta(minutes=5)
NON_POSTGRES_OUTBOX_SINGLE_WORKER_ERROR = (
    "Transactional outbox dispatch requires a single worker when the database dialect is not PostgreSQL"
)


def _claimable_events_condition(*, now, reclaim_before):
    return or_(
        (OutboxEvent.status == "pending") & (OutboxEvent.available_at <= now),
        (OutboxEvent.status == "processing")
        & (OutboxEvent.locked_at.is_not(None))
        & (OutboxEvent.locked_at <= reclaim_before),
    )


class OutboxService:
    """Persistence operations for durable outbox events."""

    @staticmethod
    async def enqueue(
        db: AsyncSession,
        *,
        event_type: str,
        aggregate_type: str,
        aggregate_id: int | None,
        idempotency_key: str,
        payload: OutboxPayloadModel | dict,
    ) -> OutboxEvent:
        validated_payload = validate_outbox_payload(event_type, payload)
        event = OutboxEvent(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            idempotency_key=idempotency_key,
            payload=validated_payload.model_dump(mode="json"),
            status="pending",
            available_at=utc_now(),
            created_at=utc_now(),
        )
        db.add(event)
        await db.flush()
        return event

    @staticmethod
    async def _claim_batch_postgres(
        db: AsyncSession,
        *,
        batch_size: int,
        lock_owner: str,
        now,
        reclaim_before,
    ) -> list[str]:
        claimable_ids = (
            select(OutboxEvent.id)
            .where(_claimable_events_condition(now=now, reclaim_before=reclaim_before))
            .order_by(OutboxEvent.created_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .cte("claimable_outbox_ids")
        )
        result = await db.execute(
            update(OutboxEvent)
            .where(OutboxEvent.id.in_(select(claimable_ids.c.id)))
            .values(
                status="processing",
                locked_at=now,
                locked_by=lock_owner,
                attempt_count=OutboxEvent.attempt_count + 1,
            )
            .returning(OutboxEvent.id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def _claim_batch_fallback(
        db: AsyncSession,
        *,
        batch_size: int,
        lock_owner: str,
        now,
        reclaim_before,
    ) -> list[str]:
        result = await db.execute(
            select(OutboxEvent)
            .where(_claimable_events_condition(now=now, reclaim_before=reclaim_before))
            .order_by(OutboxEvent.created_at.asc())
            .limit(batch_size)
        )
        events = result.scalars().all()
        if not events:
            return []

        event_ids: list[str] = []
        for event in events:
            event.status = "processing"
            event.locked_at = now
            event.locked_by = lock_owner
            event.attempt_count += 1
            db.add(event)
            event_ids.append(event.id)
        return event_ids

    @staticmethod
    async def claim_batch(
        db: AsyncSession,
        *,
        batch_size: int = OUTBOX_BATCH_SIZE,
        lock_owner: str = "scheduler",
    ) -> list[str]:
        now = utc_now()
        reclaim_before = now - OUTBOX_RECLAIM_AFTER
        dialect_name = db.get_bind().dialect.name
        if dialect_name == "postgresql":
            event_ids = await OutboxService._claim_batch_postgres(
                db,
                batch_size=batch_size,
                lock_owner=lock_owner,
                now=now,
                reclaim_before=reclaim_before,
            )
        else:
            event_ids = await OutboxService._claim_batch_fallback(
                db,
                batch_size=batch_size,
                lock_owner=lock_owner,
                now=now,
                reclaim_before=reclaim_before,
            )
        await db.flush()
        return event_ids

    @staticmethod
    async def mark_succeeded(db: AsyncSession, event_id: str) -> None:
        event = await db.get(OutboxEvent, event_id)
        if event is None:
            return
        event.status = "succeeded"
        event.processed_at = utc_now()
        event.locked_at = None
        event.locked_by = None
        event.last_error = None
        db.add(event)
        await db.flush()

    @staticmethod
    async def mark_dead_letter(db: AsyncSession, event_id: str, *, error_message: str) -> None:
        event = await db.get(OutboxEvent, event_id)
        if event is None:
            return
        event.status = "dead_letter"
        event.processed_at = utc_now()
        event.locked_at = None
        event.locked_by = None
        event.last_error = error_message
        db.add(event)
        await db.flush()

    @staticmethod
    async def mark_retry(db: AsyncSession, event_id: str, *, error_message: str) -> None:
        event = await db.get(OutboxEvent, event_id)
        if event is None:
            return

        if event.attempt_count >= OUTBOX_MAX_ATTEMPTS:
            event.status = "dead_letter"
            event.processed_at = utc_now()
        else:
            delay_seconds = min(300, 2 ** max(0, event.attempt_count - 1))
            event.status = "pending"
            event.available_at = utc_now() + timedelta(seconds=delay_seconds)

        event.locked_at = None
        event.locked_by = None
        event.last_error = error_message
        db.add(event)
        await db.flush()


def ensure_outbox_runtime_supported(*, dialect_name: str, worker_count: int) -> None:
    if dialect_name != "postgresql" and worker_count > 1:
        raise RuntimeError(NON_POSTGRES_OUTBOX_SINGLE_WORKER_ERROR)
