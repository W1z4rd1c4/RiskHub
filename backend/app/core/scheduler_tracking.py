from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from datetime import datetime
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc, utc_now
from app.models.scheduler_job_run import SchedulerJobRun

type DbContextFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


def normalize_result(result: object) -> dict | None:
    if result is None:
        return None
    if isinstance(result, dict):
        return result
    return {"result": result}


def compute_duration_ms(started_at: datetime | None) -> int:
    started = coerce_utc(started_at) or utc_now()
    return int((utc_now() - started).total_seconds() * 1000)


async def record_job_start(
    *,
    db_context: DbContextFactory,
    instance_id: str,
    job_name: str,
    run_id: str,
    trigger_type: str = "scheduled",
    scheduled_for: datetime | None = None,
) -> SchedulerJobRun:
    async with db_context() as db:
        job_run = SchedulerJobRun(
            job_name=job_name,
            run_id=run_id,
            status="running",
            trigger_type=trigger_type,
            instance_id=instance_id,
            scheduled_for=scheduled_for,
            started_at=utc_now(),
        )
        db.add(job_run)
        await db.commit()
        await db.refresh(job_run)
        return job_run


async def record_job_finish(
    db: AsyncSession,
    *,
    job_run_id: str,
    status: str,
    result_json: dict | None = None,
    error_message: str | None = None,
) -> None:
    job_run = await db.get(SchedulerJobRun, job_run_id)
    if job_run is None:
        return

    job_run.status = status
    job_run.finished_at = utc_now()
    job_run.duration_ms = compute_duration_ms(job_run.started_at)
    job_run.result_json = result_json
    job_run.error_message = error_message
    db.add(job_run)
    await db.commit()


async def record_job_finish_with_context(
    *,
    db_context: DbContextFactory,
    job_run_id: str,
    status: str,
    result_json: dict | None = None,
    error_message: str | None = None,
) -> None:
    async with db_context() as db:
        await record_job_finish(
            db,
            job_run_id=job_run_id,
            status=status,
            result_json=result_json,
            error_message=error_message,
        )


async def execute_tracked_job(
    job_name: str,
    job_func: Callable[[], Awaitable[object]],
    *,
    db_context: DbContextFactory,
    instance_id: str,
    logger,
    trigger_type: str = "scheduled",
) -> dict | None:
    run_id = str(uuid4())
    job_run = await record_job_start(
        db_context=db_context,
        instance_id=instance_id,
        job_name=job_name,
        run_id=run_id,
        trigger_type=trigger_type,
    )
    logger.info(
        "scheduler_job_started",
        job_name=job_name,
        run_id=run_id,
        instance_id=instance_id,
        trigger_type=trigger_type,
    )
    try:
        result = normalize_result(await job_func())
    except Exception as exc:
        await record_job_finish_with_context(
            db_context=db_context,
            job_run_id=job_run.id,
            status="failed",
            error_message=str(exc),
        )
        logger.exception(
            "scheduler_job_failed",
            job_name=job_name,
            run_id=run_id,
            instance_id=instance_id,
            error_message=str(exc),
        )
        raise

    await record_job_finish_with_context(
        db_context=db_context,
        job_run_id=job_run.id,
        status="succeeded",
        result_json=result,
    )
    logger.info(
        "scheduler_job_succeeded",
        job_name=job_name,
        run_id=run_id,
        instance_id=instance_id,
        result=result,
    )
    return result


async def execute_tracked_job_with_session(
    db: AsyncSession,
    job_name: str,
    job_func: Callable[[AsyncSession], Awaitable[object]],
    *,
    instance_id: str,
    logger,
    trigger_type: str = "manual",
) -> dict | None:
    run_id = str(uuid4())
    job_run = SchedulerJobRun(
        job_name=job_name,
        run_id=run_id,
        status="running",
        trigger_type=trigger_type,
        instance_id=instance_id,
        started_at=utc_now(),
    )
    db.add(job_run)
    await db.commit()
    await db.refresh(job_run)
    logger.info(
        "scheduler_job_started",
        job_name=job_name,
        run_id=run_id,
        instance_id=instance_id,
        trigger_type=trigger_type,
    )

    try:
        result = normalize_result(await job_func(db))
    except Exception as exc:
        await db.rollback()
        await record_job_finish(db, job_run_id=job_run.id, status="failed", error_message=str(exc))
        logger.exception(
            "scheduler_job_failed",
            job_name=job_name,
            run_id=run_id,
            instance_id=instance_id,
            error_message=str(exc),
        )
        raise

    await record_job_finish(db, job_run_id=job_run.id, status="succeeded", result_json=result)
    logger.info(
        "scheduler_job_succeeded",
        job_name=job_name,
        run_id=run_id,
        instance_id=instance_id,
        result=result,
    )
    return result
