"""Compatibility facade for scheduler runtime ownership and job tracking."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core import scheduler_runtime
from app.core.logging import get_logger
from app.core.scheduler_locks import (
    SCHEDULER_LOCK_CLASS_ID,
    SCHEDULER_LOCK_OBJECT_ID,
    PostgresAdvisoryLockProvider,
    SchedulerLockProvider,
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
    runtime_state,
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
    "get_scheduler_role_status",
    "setup_scheduler",
    "start_scheduler",
    "start_scheduler_async",
    "stop_scheduler",
    "stop_scheduler_async",
]

PROCESS_INSTANCE_ID = runtime_state.process_instance_id
PROCESS_STARTED_AT = runtime_state.process_started_at


def __getattr__(name: str):
    if name == "scheduler":
        return runtime_state.scheduler
    if name == "_db_sessionmaker":
        return runtime_state.db_sessionmaker
    if name == "_db_engine":
        return runtime_state.db_engine
    if name == "_lock_provider":
        return runtime_state.lock_provider
    if name == "_runtime_run_id":
        return runtime_state.runtime_run_id
    if name == "_outbox_dispatch_state":
        return outbox_dispatch_state
    raise AttributeError(name)


def _sync_runtime_from_compat_globals() -> None:
    compat = globals()
    if "scheduler" in compat:
        runtime_state.scheduler = compat["scheduler"]
    if "_db_sessionmaker" in compat:
        runtime_state.db_sessionmaker = compat["_db_sessionmaker"]
    if "_db_engine" in compat:
        runtime_state.db_engine = compat["_db_engine"]
    if "_lock_provider" in compat:
        runtime_state.lock_provider = compat["_lock_provider"]
    if "_runtime_run_id" in compat:
        runtime_state.runtime_run_id = compat["_runtime_run_id"]


def _sync_compat_globals_from_runtime() -> None:
    compat = globals()
    if "scheduler" in compat:
        compat["scheduler"] = runtime_state.scheduler
    if "_db_sessionmaker" in compat:
        compat["_db_sessionmaker"] = runtime_state.db_sessionmaker
    if "_db_engine" in compat:
        compat["_db_engine"] = runtime_state.db_engine
    if "_lock_provider" in compat:
        compat["_lock_provider"] = runtime_state.lock_provider
    if "_runtime_run_id" in compat:
        compat["_runtime_run_id"] = runtime_state.runtime_run_id


def configure_scheduler(sessionmaker: async_sessionmaker[AsyncSession], engine: AsyncEngine) -> None:
    scheduler_runtime.configure_scheduler(sessionmaker, engine)
    _sync_compat_globals_from_runtime()


def get_db_context():
    return scheduler_runtime.get_db_context()


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
    return await _execute_tracked_job_with_session(
        db,
        job_name,
        job_func,
        instance_id=PROCESS_INSTANCE_ID,
        logger=logger,
        trigger_type=trigger_type,
    )


def _resolve_lock_provider() -> SchedulerLockProvider:
    return scheduler_runtime.resolve_lock_provider()


async def _mark_runtime_started() -> None:
    await scheduler_runtime.mark_runtime_started()
    _sync_compat_globals_from_runtime()


async def _mark_runtime_stopped() -> None:
    await scheduler_runtime.mark_runtime_stopped()
    _sync_compat_globals_from_runtime()


async def _release_lock_provider(*, suppress_exceptions: bool) -> None:
    await scheduler_runtime.release_lock_provider(suppress_exceptions=suppress_exceptions)
    _sync_compat_globals_from_runtime()


def get_scheduler_runtime_state() -> dict[str, object]:
    _sync_runtime_from_compat_globals()
    return scheduler_runtime.get_scheduler_runtime_state()


def setup_scheduler() -> tuple[str, tuple[str, ...]]:
    _sync_runtime_from_compat_globals()
    result = scheduler_runtime.setup_scheduler()
    _sync_compat_globals_from_runtime()
    return result


def start_scheduler():
    raise RuntimeError("start_scheduler is async; call await start_scheduler_async() instead")


async def start_scheduler_async() -> None:
    _sync_runtime_from_compat_globals()
    await scheduler_runtime.start_scheduler_async(
        ensure_outbox_runtime_supported=ensure_outbox_runtime_supported,
        resolve_lock_provider_func=_resolve_lock_provider,
        mark_runtime_started_func=_mark_runtime_started,
        release_lock_provider_func=_release_lock_provider,
    )
    _sync_compat_globals_from_runtime()


def stop_scheduler():
    raise RuntimeError("stop_scheduler is async; call await stop_scheduler_async() instead")


async def stop_scheduler_async() -> None:
    _sync_runtime_from_compat_globals()
    await scheduler_runtime.stop_scheduler_async(
        mark_runtime_stopped_func=_mark_runtime_stopped,
        release_lock_provider_func=_release_lock_provider,
    )
    _sync_compat_globals_from_runtime()
