"""Background task scheduler for KRI deadline checking and other periodic tasks."""

import sys
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core import scheduler_runtime
from app.core.datetime_utils import utc_now
from app.core.logging import get_logger
from app.core.scheduler_locks import (
    SCHEDULER_LOCK_CLASS_ID,
    SCHEDULER_LOCK_OBJECT_ID,
    PostgresAdvisoryLockProvider,
    SchedulerLockProvider,
)
from app.core.scheduler_ownership import (
    mark_scheduler_runtime_started,
    mark_scheduler_runtime_stopped,
    release_scheduler_lock,
)
from app.core.scheduler_registry import (
    DEFAULT_SCHEDULER_JOB_PROFILE,
    FULL_SCHEDULER_JOB_IDS,
    OPTIONAL_SCHEDULER_JOB_IDS,
    OUTBOX_ONLY_SCHEDULER_JOB_IDS,
    SCHEDULER_JOB_PROFILE_ENV,
    SCHEDULER_RUNTIME_JOB_NAME,
)
from app.core.scheduler_runtime import (
    get_outbox_dispatch_runtime_state,
    get_scheduler_role_status,
    outbox_dispatch_state,
)
from app.core.scheduler_tracking import execute_tracked_job as _execute_tracked_job
from app.core.scheduler_tracking import execute_tracked_job_with_session as _execute_tracked_job_with_session
from app.core.scheduler_tracking import record_job_start as _record_job_start_impl
from app.models.scheduler_job_run import SchedulerJobRun
from app.services.outbox.store import ensure_outbox_runtime_supported

logger = get_logger("scheduler")

__all__ = [
    "DEFAULT_SCHEDULER_JOB_PROFILE",
    "FULL_SCHEDULER_JOB_IDS",
    "OPTIONAL_SCHEDULER_JOB_IDS",
    "OUTBOX_ONLY_SCHEDULER_JOB_IDS",
    "PROCESS_INSTANCE_ID",
    "PROCESS_STARTED_AT",
    "SCHEDULER_JOB_PROFILE_ENV",
    "SCHEDULER_LOCK_CLASS_ID",
    "SCHEDULER_LOCK_OBJECT_ID",
    "SCHEDULER_RUNTIME_JOB_NAME",
    "PostgresAdvisoryLockProvider",
    "SchedulerLockProvider",
    "configure_scheduler",
    "execute_tracked_job",
    "execute_tracked_job_with_session",
    "get_db_context",
    "get_outbox_dispatch_runtime_state",
    "get_scheduler_runtime_state",
    "scheduler",
    "setup_scheduler",
    "start_scheduler",
    "start_scheduler_async",
    "stop_scheduler",
    "stop_scheduler_async",
]

# Global scheduler instance
_scheduler_factory = AsyncIOScheduler
scheduler = _scheduler_factory()
_db_sessionmaker: async_sessionmaker[AsyncSession] | None = None
_db_engine: AsyncEngine | None = None
_lock_provider: "SchedulerLockProvider | None" = None
_runtime_run_id: str | None = None
_outbox_dispatch_state = outbox_dispatch_state

PROCESS_INSTANCE_ID = str(uuid4())
PROCESS_STARTED_AT = utc_now()


def configure_scheduler(sessionmaker: async_sessionmaker[AsyncSession], engine: AsyncEngine) -> None:
    global _db_sessionmaker
    global _db_engine
    _db_sessionmaker = sessionmaker
    _db_engine = engine


@asynccontextmanager
async def get_db_context():
    """Context manager for database session in scheduler jobs."""
    if _db_sessionmaker is None:
        raise RuntimeError("Scheduler DB sessionmaker not configured")
    async with _db_sessionmaker() as session:
        try:
            yield session
        finally:
            await session.close()


async def _record_job_start(
    *,
    job_name: str,
    run_id: str,
    trigger_type: str = "scheduled",
    scheduled_for=None,
) -> SchedulerJobRun:
    return await _record_job_start_impl(
        db_context=get_db_context,
        instance_id=PROCESS_INSTANCE_ID,
        job_name=job_name,
        run_id=run_id,
        trigger_type=trigger_type,
        scheduled_for=scheduled_for,
    )


async def execute_tracked_job(
    job_name: str,
    job_func: Callable[[], Awaitable[object]],
    *,
    trigger_type: str = "scheduled",
) -> dict | None:
    """Run a scheduled job with durable execution tracking."""
    return await _execute_tracked_job(
        job_name,
        job_func,
        db_context=get_db_context,
        instance_id=PROCESS_INSTANCE_ID,
        logger=logger,
        trigger_type=trigger_type,
    )


async def execute_tracked_job_with_session(
    db: AsyncSession,
    job_name: str,
    job_func: Callable[[AsyncSession], Awaitable[object]],
    *,
    trigger_type: str = "manual",
) -> dict | None:
    """Run a tracked job using an existing session, for request-driven manual operations."""
    return await _execute_tracked_job_with_session(
        db,
        job_name,
        job_func,
        instance_id=PROCESS_INSTANCE_ID,
        logger=logger,
        trigger_type=trigger_type,
    )


def _resolve_lock_provider() -> SchedulerLockProvider:
    if _db_engine is not None and _db_engine.dialect.name == "postgresql":
        return PostgresAdvisoryLockProvider(_db_engine)
    return SchedulerLockProvider()


async def _mark_runtime_started() -> None:
    global _runtime_run_id
    _runtime_run_id = await mark_scheduler_runtime_started(
        db_context=get_db_context,
        instance_id=PROCESS_INSTANCE_ID,
        runtime_job_name=SCHEDULER_RUNTIME_JOB_NAME,
    )


async def _mark_runtime_stopped() -> None:
    await mark_scheduler_runtime_stopped(
        db_context=get_db_context,
        runtime_job_name=SCHEDULER_RUNTIME_JOB_NAME,
        runtime_run_id=_runtime_run_id,
    )


async def _release_lock_provider(*, suppress_exceptions: bool) -> None:
    global _lock_provider

    provider = _lock_provider
    try:
        await release_scheduler_lock(
            provider=provider,
            logger=logger,
            instance_id=PROCESS_INSTANCE_ID,
            suppress_exceptions=suppress_exceptions,
        )
    finally:
        _lock_provider = None


def get_scheduler_runtime_state() -> dict[str, object]:
    return scheduler_runtime.get_scheduler_runtime_state(sys.modules[__name__])


def setup_scheduler() -> tuple[str, tuple[str, ...]]:
    return scheduler_runtime.setup_scheduler(sys.modules[__name__])


def start_scheduler():
    """
    Start the scheduler. Call during app startup.

    Multi-worker safety: Only starts if ENABLE_SCHEDULER=true.
    In production with multiple Uvicorn/Gunicorn workers, set ENABLE_SCHEDULER=true
    on exactly ONE worker process to avoid duplicate job executions.
    """
    raise RuntimeError("start_scheduler is async; call await start_scheduler_async() instead")


async def start_scheduler_async() -> None:
    await scheduler_runtime.start_scheduler_async(
        sys.modules[__name__],
        ensure_outbox_runtime_supported=ensure_outbox_runtime_supported,
    )


def stop_scheduler():
    """Stop the scheduler. Call during app shutdown."""
    raise RuntimeError("stop_scheduler is async; call await stop_scheduler_async() instead")


async def stop_scheduler_async() -> None:
    await scheduler_runtime.stop_scheduler_async(sys.modules[__name__])
