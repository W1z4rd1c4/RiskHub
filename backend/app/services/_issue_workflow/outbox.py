from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.outbox import OutboxService


async def enqueue_issue_outbox(db: AsyncSession, plan) -> None:
    await OutboxService.enqueue(
        db,
        event_type=plan.event_type,
        aggregate_type=plan.aggregate_type,
        aggregate_id=plan.aggregate_id,
        idempotency_key=plan.idempotency_key,
        payload=plan.payload,
    )
