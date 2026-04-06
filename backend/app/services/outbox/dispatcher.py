"""Dispatch claimed outbox events using isolated transactions."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger
from app.models import OutboxEvent
from app.services.outbox.errors import FatalOutboxError, RetryableOutboxError
from app.services.outbox.payloads import ValidationError, get_outbox_payload_model
from app.services.outbox.registry import OUTBOX_EVENT_HANDLERS
from app.services.outbox.store import OUTBOX_BATCH_SIZE, OutboxService

logger = get_logger("outbox")


async def dispatch_pending_outbox_events(
    sessionmaker: async_sessionmaker[AsyncSession],
    *,
    batch_size: int = OUTBOX_BATCH_SIZE,
    lock_owner: str = "scheduler",
) -> int:
    """Claim a batch of outbox events and process them with isolated transactions."""
    async with sessionmaker() as claim_session:
        claimed_ids = await OutboxService.claim_batch(
            claim_session,
            batch_size=batch_size,
            lock_owner=lock_owner,
        )

    processed = 0
    for event_id in claimed_ids:
        async with sessionmaker() as session:
            event = await session.get(OutboxEvent, event_id)
            if event is None or event.status != "processing":
                continue

            event_type = event.event_type
            idempotency_key = event.idempotency_key
            payload_model = get_outbox_payload_model(event.event_type)
            handler = OUTBOX_EVENT_HANDLERS.get(event.event_type)
            if payload_model is None or handler is None:
                await OutboxService.mark_dead_letter(
                    session,
                    event_id,
                    error_message=f"Unknown outbox event type: {event.event_type}",
                )
                continue

            try:
                payload = payload_model.model_validate(event.payload)
            except ValidationError as exc:
                await OutboxService.mark_dead_letter(
                    session,
                    event_id,
                    error_message=f"Invalid outbox payload for {event.event_type}: {exc}",
                )
                continue

            try:
                await handler(session, payload)
                await OutboxService.mark_succeeded(session, event_id)
                processed += 1
            except RetryableOutboxError as exc:
                await session.rollback()
                async with sessionmaker() as retry_session:
                    await OutboxService.mark_retry(retry_session, event_id, error_message=str(exc))
                logger.exception(
                    "outbox_event_failed",
                    error_category="retryable_handler_execution",
                    outbox_event_id=event_id,
                    event_type=event_type,
                    idempotency_key=idempotency_key,
                    error_message=str(exc),
                )
            except FatalOutboxError as exc:
                await session.rollback()
                async with sessionmaker() as dead_letter_session:
                    await OutboxService.mark_dead_letter(dead_letter_session, event_id, error_message=str(exc))
                logger.exception(
                    "outbox_event_failed",
                    error_category="fatal_handler_execution",
                    outbox_event_id=event_id,
                    event_type=event_type,
                    idempotency_key=idempotency_key,
                    error_message=str(exc),
                )
            except Exception as exc:
                await session.rollback()
                async with sessionmaker() as dead_letter_session:
                    await OutboxService.mark_dead_letter(dead_letter_session, event_id, error_message=str(exc))
                logger.exception(
                    "outbox_event_failed",
                    error_category="unclassified_handler_execution",
                    outbox_event_id=event_id,
                    event_type=event_type,
                    idempotency_key=idempotency_key,
                    error_message=str(exc),
                )

    if processed:
        logger.info("outbox_batch_processed", processed=processed)
    return processed
