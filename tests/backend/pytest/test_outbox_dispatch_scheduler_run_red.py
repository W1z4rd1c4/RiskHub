"""BE-N7: dispatch_pending_outbox_events records a SchedulerJobRun row."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.datetime_utils import utc_now
from app.models import OutboxEvent
from app.models.scheduler_job_run import SchedulerJobRun
from app.services.outbox.dispatcher import dispatch_pending_outbox_events

pytestmark = pytest.mark.contract


def _sessionmaker(async_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.mark.asyncio
async def test_dispatch_records_running_then_succeeded(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One queued event creates one succeeded SchedulerJobRun with events_processed=1."""

    event = OutboxEvent(
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=1,
        idempotency_key="approval.request_created:scheduler-run",
        payload={"approval_id": 1},
        status="pending",
        available_at=utc_now(),
    )
    db_session.add(event)
    await db_session.commit()

    async def no_op_handler(_db: AsyncSession, _payload) -> None:
        return None

    import app.services.outbox.dispatcher as dispatcher_module

    monkeypatch.setitem(dispatcher_module.OUTBOX_EVENT_HANDLERS, event.event_type, no_op_handler)

    processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine), lock_owner="test")
    assert processed == 1

    async with _sessionmaker(async_engine)() as db:
        rows = await db.execute(
            select(SchedulerJobRun)
            .where(SchedulerJobRun.job_name == "outbox_dispatch")
            .order_by(SchedulerJobRun.started_at.desc())
        )
        run = rows.scalars().first()

    assert run is not None
    assert run.status == "succeeded"
    assert run.started_at is not None
    assert run.finished_at is not None
    assert run.duration_ms is not None
    assert (run.result_json or {}).get("events_processed") == 1
