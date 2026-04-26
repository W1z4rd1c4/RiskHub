from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.scheduler_locks import SchedulerLockProvider
from app.core.scheduler_tracking import compute_duration_ms, record_job_start
from app.models.scheduler_job_run import SchedulerJobRun

type DbContextFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


async def mark_scheduler_runtime_started(
    *,
    db_context: DbContextFactory,
    instance_id: str,
    runtime_job_name: str,
) -> str:
    run_id = str(uuid4())
    await record_job_start(
        db_context=db_context,
        instance_id=instance_id,
        job_name=runtime_job_name,
        run_id=run_id,
        trigger_type="startup",
    )
    return run_id


async def mark_scheduler_runtime_stopped(
    *,
    db_context: DbContextFactory,
    runtime_job_name: str,
    runtime_run_id: str | None,
) -> bool:
    if runtime_run_id is None:
        return False

    async with db_context() as db:
        result = await db.execute(
            select(SchedulerJobRun)
            .where(SchedulerJobRun.job_name == runtime_job_name)
            .where(SchedulerJobRun.run_id == runtime_run_id)
            .order_by(SchedulerJobRun.started_at.desc())
            .limit(1)
        )
        runtime_run = result.scalar_one_or_none()
        if runtime_run is None:
            return False

        finished_at = utc_now()
        runtime_run.status = "stopped"
        runtime_run.finished_at = finished_at
        runtime_run.duration_ms = compute_duration_ms(runtime_run.started_at)
        runtime_run.result_json = {"stopped_at": finished_at.isoformat()}
        db.add(runtime_run)
        await db.commit()
        return True


async def release_scheduler_lock(
    *,
    provider: SchedulerLockProvider | None,
    logger,
    instance_id: str,
    suppress_exceptions: bool,
) -> None:
    if provider is None:
        return

    try:
        await provider.release()
    except Exception:
        logger.exception(
            "scheduler_lock_release_failed",
            instance_id=instance_id,
            lock_provider=provider.provider_name,
        )
        if not suppress_exceptions:
            raise
