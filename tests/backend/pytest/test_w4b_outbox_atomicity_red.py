from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.ext.asyncio.session import AsyncSessionTransaction

from app.models.outbox_event import OutboxEvent
from app.services.outbox.dispatcher import dispatch_pending_outbox_events
from app.services.outbox.store import OutboxService


def _require_postgres(async_engine) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Postgres-only outbox atomicity test")


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_outbox_mark_success_failure_does_not_commit_succeeded_status(async_engine, monkeypatch) -> None:
    _require_postgres(async_engine)

    sessionmaker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    aggregate_id = 987654321
    idempotency_key = f"test-outbox-atomicity:{uuid4()}"
    async with sessionmaker() as db:
        async with db.begin():
            event = OutboxEvent(
                event_type="approval.request_created",
                aggregate_type="approval_request",
                aggregate_id=aggregate_id,
                idempotency_key=idempotency_key,
                payload={"approval_id": aggregate_id},
            )
            db.add(event)
        event_id = event.id

    original_mark_succeeded = OutboxService.mark_succeeded

    async def fail_after_success_mark(db: AsyncSession, event_id: int) -> None:
        await original_mark_succeeded(db, event_id)
        raise RuntimeError("simulated mark_succeeded failure")

    monkeypatch.setattr(OutboxService, "mark_succeeded", fail_after_success_mark)

    processed = await dispatch_pending_outbox_events(
        sessionmaker,
        batch_size=1,
        lock_owner="outbox-atomicity-test",
    )

    assert processed == 0
    async with sessionmaker() as db:
        result = await db.execute(select(OutboxEvent).where(OutboxEvent.id == event_id))
        persisted = result.scalar_one()

    assert persisted.status != "succeeded"
    assert persisted.status in {"dead_letter", "pending"}
    assert "simulated mark_succeeded failure" in (persisted.last_error or "")


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_outbox_success_commit_failure_is_not_counted_as_processed(async_engine, monkeypatch) -> None:
    _require_postgres(async_engine)

    sessionmaker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    aggregate_id = 987654322
    idempotency_key = f"test-outbox-commit-failure:{uuid4()}"
    async with sessionmaker() as db:
        async with db.begin():
            event = OutboxEvent(
                event_type="approval.request_created",
                aggregate_type="approval_request",
                aggregate_id=aggregate_id,
                idempotency_key=idempotency_key,
                payload={"approval_id": aggregate_id},
            )
            db.add(event)
        event_id = event.id

    original_mark_succeeded = OutboxService.mark_succeeded
    original_aexit = AsyncSessionTransaction.__aexit__
    state = {"success_marked": False, "raised": False}

    async def track_mark_succeeded(db: AsyncSession, event_id: int) -> None:
        await original_mark_succeeded(db, event_id)
        state["success_marked"] = True

    async def fail_processing_commit_once(self, exc_type, exc, traceback):
        if state["success_marked"] and not state["raised"] and exc_type is None:
            state["raised"] = True
            state["success_marked"] = False
            raise RuntimeError("simulated success commit failure")
        return await original_aexit(self, exc_type, exc, traceback)

    monkeypatch.setattr(OutboxService, "mark_succeeded", track_mark_succeeded)
    monkeypatch.setattr(AsyncSessionTransaction, "__aexit__", fail_processing_commit_once)

    processed = await dispatch_pending_outbox_events(
        sessionmaker,
        batch_size=1,
        lock_owner="outbox-commit-failure-test",
    )

    assert processed == 0
    async with sessionmaker() as db:
        result = await db.execute(select(OutboxEvent).where(OutboxEvent.id == event_id))
        persisted = result.scalar_one()

    assert persisted.status == "dead_letter"
    assert "simulated success commit failure" in (persisted.last_error or "")
