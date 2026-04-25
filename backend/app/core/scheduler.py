"""Background task scheduler for KRI deadline checking and other periodic tasks."""

import os
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.datetime_utils import utc_now
from app.core.logging import get_logger
from app.core.scheduler_locks import (
    SCHEDULER_LOCK_CLASS_ID,
    SCHEDULER_LOCK_OBJECT_ID,
    PostgresAdvisoryLockProvider,
    SchedulerLockProvider,
)
from app.core.scheduler_runtime import (
    get_outbox_dispatch_runtime_state,
    get_scheduler_role_status,
    outbox_dispatch_state,
)
from app.core.scheduler_tracking import compute_duration_ms as _compute_duration_ms
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
scheduler = AsyncIOScheduler()
_db_sessionmaker: async_sessionmaker[AsyncSession] | None = None
_db_engine: AsyncEngine | None = None
_lock_provider: "SchedulerLockProvider | None" = None
_runtime_run_id: str | None = None
_outbox_dispatch_state = outbox_dispatch_state

SCHEDULER_RUNTIME_JOB_NAME = "__scheduler_runtime__"
SCHEDULER_JOB_PROFILE_ENV = "SCHEDULER_JOB_PROFILE"
DEFAULT_SCHEDULER_JOB_PROFILE = "full"
FULL_SCHEDULER_JOB_IDS = (
    "kri_deadline_check",
    "questionnaire_deadline_check",
    "issue_deadline_check",
    "ad_deprovision_check",
    "orphan_scan",
    "outbox_dispatch",
)
OPTIONAL_SCHEDULER_JOB_IDS = ("sso_jwks_refresh",)
OUTBOX_ONLY_SCHEDULER_JOB_IDS = ("outbox_dispatch",)
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
    _runtime_run_id = str(uuid4())
    await _record_job_start(
        job_name=SCHEDULER_RUNTIME_JOB_NAME,
        run_id=_runtime_run_id,
        trigger_type="startup",
    )


async def _mark_runtime_stopped() -> None:
    if _runtime_run_id is None:
        return

    async with get_db_context() as db:
        result = await db.execute(
            select(SchedulerJobRun)
            .where(SchedulerJobRun.job_name == SCHEDULER_RUNTIME_JOB_NAME)
            .where(SchedulerJobRun.run_id == _runtime_run_id)
            .order_by(SchedulerJobRun.started_at.desc())
            .limit(1)
        )
        runtime_run = result.scalar_one_or_none()
        if runtime_run is None:
            return

        finished_at = utc_now()
        runtime_run.status = "stopped"
        runtime_run.finished_at = finished_at
        runtime_run.duration_ms = _compute_duration_ms(runtime_run.started_at)
        runtime_run.result_json = {"stopped_at": finished_at.isoformat()}
        db.add(runtime_run)
        await db.commit()


async def _release_lock_provider(*, suppress_exceptions: bool) -> None:
    global _lock_provider

    if _lock_provider is None:
        return

    provider = _lock_provider
    try:
        await provider.release()
    except Exception:
        logger.exception(
            "scheduler_lock_release_failed",
            instance_id=PROCESS_INSTANCE_ID,
            lock_provider=provider.provider_name,
        )
        if not suppress_exceptions:
            raise
    finally:
        _lock_provider = None


def get_scheduler_runtime_state() -> dict[str, object]:
    lock_provider = _lock_provider.provider_name if _lock_provider is not None else None
    enable = os.getenv("ENABLE_SCHEDULER", "false").lower() == "true"
    lock_acquired = bool(_lock_provider.lock_acquired) if _lock_provider is not None else False
    state_details = get_scheduler_role_status(
        scheduler_enabled=enable,
        scheduler_running=scheduler.running,
        lock_acquired=lock_acquired,
    )
    return {
        "process_role": "scheduler" if enable else "api",
        "instance_id": PROCESS_INSTANCE_ID,
        "process_started_at": PROCESS_STARTED_AT.isoformat(),
        "scheduler_enabled": enable,
        "scheduler_running": scheduler.running,
        "lock_provider": lock_provider,
        "lock_acquired": lock_acquired,
        **state_details,
    }


def setup_scheduler() -> tuple[str, tuple[str, ...]]:
    """Configure scheduled jobs. Job definitions live in scheduler_jobs."""
    from app.core.config import get_settings
    from app.core.scheduler_jobs import (
        register_full_scheduler_jobs,
        register_outbox_only_scheduler_jobs,
        resolve_scheduler_job_profile,
        set_db_sessionmaker_ref,
    )

    settings = get_settings()
    scheduler.remove_all_jobs()
    set_db_sessionmaker_ref(_db_sessionmaker)

    profile = resolve_scheduler_job_profile()
    if profile == "outbox_only":
        registered_job_ids = register_outbox_only_scheduler_jobs()
    else:
        registered_job_ids = register_full_scheduler_jobs(settings)

    logger.info(
        "scheduler_configured",
        scheduler_job_profile=profile,
        registered_job_ids=list(registered_job_ids),
        instance_id=PROCESS_INSTANCE_ID,
    )
    return profile, registered_job_ids


def start_scheduler():
    """
    Start the scheduler. Call during app startup.

    Multi-worker safety: Only starts if ENABLE_SCHEDULER=true.
    In production with multiple Uvicorn/Gunicorn workers, set ENABLE_SCHEDULER=true
    on exactly ONE worker process to avoid duplicate job executions.
    """
    raise RuntimeError("start_scheduler is async; call await start_scheduler_async() instead")


async def start_scheduler_async() -> None:
    """Start the scheduler after acquiring runtime ownership."""
    global _lock_provider
    global _runtime_run_id

    enable = os.getenv("ENABLE_SCHEDULER", "false").lower()
    if enable != "true":
        logger.info("scheduler_disabled", scheduler_enabled=False, instance_id=PROCESS_INSTANCE_ID)
        return
    if _db_sessionmaker is None:
        logger.warning(
            "scheduler_not_started", reason="db_sessionmaker_not_configured", instance_id=PROCESS_INSTANCE_ID
        )
        return
    if _db_engine is None:
        logger.warning("scheduler_not_started", reason="db_engine_not_configured", instance_id=PROCESS_INSTANCE_ID)
        return

    if scheduler.running:
        return

    from app.core.scheduler_jobs import resolve_process_worker_count

    ensure_outbox_runtime_supported(
        dialect_name=_db_engine.dialect.name,
        worker_count=resolve_process_worker_count(),
    )

    provider = _resolve_lock_provider()
    _lock_provider = provider
    lock_acquired = await provider.acquire()
    logger.info(
        "scheduler_lock_attempt",
        scheduler_enabled=True,
        instance_id=PROCESS_INSTANCE_ID,
        lock_provider=provider.provider_name,
        lock_acquired=lock_acquired,
    )
    if not lock_acquired:
        return

    try:
        profile, registered_job_ids = setup_scheduler()
        scheduler.start()
        await _mark_runtime_started()
    except Exception:
        if scheduler.running:
            try:
                scheduler.shutdown(wait=False)
            except Exception:
                logger.exception(
                    "scheduler_shutdown_failed_after_start_error",
                    instance_id=PROCESS_INSTANCE_ID,
                    lock_provider=provider.provider_name,
                )
        _runtime_run_id = None
        await _release_lock_provider(suppress_exceptions=True)
        raise

    logger.info(
        "scheduler_started",
        scheduler_enabled=True,
        scheduler_job_profile=profile,
        registered_job_ids=list(registered_job_ids),
        instance_id=PROCESS_INSTANCE_ID,
        lock_provider=provider.provider_name,
        lock_acquired=True,
    )


def stop_scheduler():
    """Stop the scheduler. Call during app shutdown."""
    raise RuntimeError("stop_scheduler is async; call await stop_scheduler_async() instead")


async def stop_scheduler_async() -> None:
    """Stop the scheduler and release runtime ownership."""
    global _runtime_run_id

    try:
        if scheduler.running:
            try:
                scheduler.shutdown(wait=False)
            except Exception:
                logger.exception("scheduler_shutdown_failed", instance_id=PROCESS_INSTANCE_ID)

            try:
                await _mark_runtime_stopped()
            except Exception:
                logger.exception("scheduler_runtime_stop_mark_failed", instance_id=PROCESS_INSTANCE_ID)
            else:
                logger.info("scheduler_stopped", instance_id=PROCESS_INSTANCE_ID)
    finally:
        _runtime_run_id = None
        await _release_lock_provider(suppress_exceptions=True)
