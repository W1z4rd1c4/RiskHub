"""Background task scheduler for KRI deadline checking and other periodic tasks."""
import os
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker

from app.core.datetime_utils import coerce_utc, utc_now
from app.core.logging import get_logger
from app.models.scheduler_job_run import SchedulerJobRun
from app.models.vendor import Vendor
from app.services.issue_deadline_service import IssueDeadlineService
from app.services.kri_deadline_service import KRIDeadlineService
from app.services.orphaned_item_service import OrphanedItemService
from app.services.outbox_service import OUTBOX_DISPATCH_INTERVAL_SECONDS, dispatch_pending_outbox_events
from app.services.questionnaire_deadline_service import QuestionnaireDeadlineService
from app.services.vendor_reassessment_service import VendorReassessmentService
from app.services.vendor_signal_service import VendorSignalService
from app.services.vendor_sla_deadline_service import VendorSLADeadlineService

logger = get_logger("scheduler")

# Global scheduler instance
scheduler = AsyncIOScheduler()
_db_sessionmaker: async_sessionmaker[AsyncSession] | None = None
_db_engine: AsyncEngine | None = None
_lock_provider: "SchedulerLockProvider | None" = None
_runtime_run_id: str | None = None
_outbox_dispatch_state: dict[str, object | None] = {
    "last_started_at": None,
    "last_finished_at": None,
    "last_status": None,
    "last_processed": None,
    "last_error": None,
}

SCHEDULER_LOCK_CLASS_ID = 424242
SCHEDULER_LOCK_OBJECT_ID = 1
SCHEDULER_RUNTIME_JOB_NAME = "__scheduler_runtime__"
SCHEDULER_JOB_IDS = (
    "kri_deadline_check",
    "questionnaire_deadline_check",
    "vendor_reassessment_check",
    "vendor_sla_check",
    "vendor_signal_refresh",
    "issue_deadline_check",
    "ad_deprovision_check",
    "orphan_scan",
)
PROCESS_INSTANCE_ID = str(uuid4())
PROCESS_STARTED_AT = utc_now()


class SchedulerLockProvider:
    """Scheduler ownership abstraction."""

    provider_name = "noop"

    def __init__(self) -> None:
        self.lock_acquired = False

    async def acquire(self) -> bool:
        self.lock_acquired = True
        return True

    async def release(self) -> None:
        self.lock_acquired = False


class PostgresAdvisoryLockProvider(SchedulerLockProvider):
    """Holds a Postgres advisory lock on a dedicated connection for scheduler ownership."""

    provider_name = "postgres_advisory_lock"

    def __init__(self, engine: AsyncEngine) -> None:
        super().__init__()
        self._engine = engine
        self._connection: AsyncConnection | None = None

    async def acquire(self) -> bool:
        if self._connection is not None:
            return self.lock_acquired

        connection = await self._engine.connect()
        acquired = bool(
            (
                await connection.execute(
                    text("SELECT pg_try_advisory_lock(:class_id, :object_id)"),
                    {"class_id": SCHEDULER_LOCK_CLASS_ID, "object_id": SCHEDULER_LOCK_OBJECT_ID},
                )
            ).scalar()
        )
        if acquired:
            self._connection = connection
            self.lock_acquired = True
            return True

        await connection.close()
        self.lock_acquired = False
        return False

    async def release(self) -> None:
        if self._connection is None:
            self.lock_acquired = False
            return

        try:
            await self._connection.execute(
                text("SELECT pg_advisory_unlock(:class_id, :object_id)"),
                {"class_id": SCHEDULER_LOCK_CLASS_ID, "object_id": SCHEDULER_LOCK_OBJECT_ID},
            )
        finally:
            await self._connection.close()
            self._connection = None
            self.lock_acquired = False


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


def _normalize_result(result: object) -> dict | None:
    if result is None:
        return None
    if isinstance(result, dict):
        return result
    return {"result": result}


def _compute_duration_ms(started_at) -> int:
    started = coerce_utc(started_at) or utc_now()
    return int((utc_now() - started).total_seconds() * 1000)


async def _record_job_start(
    *,
    job_name: str,
    run_id: str,
    trigger_type: str = "scheduled",
    scheduled_for=None,
) -> SchedulerJobRun:
    async with get_db_context() as db:
        job_run = SchedulerJobRun(
            job_name=job_name,
            run_id=run_id,
            status="running",
            trigger_type=trigger_type,
            instance_id=PROCESS_INSTANCE_ID,
            scheduled_for=scheduled_for,
            started_at=utc_now(),
        )
        db.add(job_run)
        await db.commit()
        await db.refresh(job_run)
        return job_run


async def _record_job_finish(
    *,
    job_run_id: str,
    status: str,
    result_json: dict | None = None,
    error_message: str | None = None,
) -> None:
    async with get_db_context() as db:
        job_run = await db.get(SchedulerJobRun, job_run_id)
        if job_run is None:
            return

        finished_at = utc_now()
        job_run.status = status
        job_run.finished_at = finished_at
        job_run.duration_ms = _compute_duration_ms(job_run.started_at)
        job_run.result_json = result_json
        job_run.error_message = error_message
        db.add(job_run)
        await db.commit()


async def execute_tracked_job(
    job_name: str,
    job_func: Callable[[], Awaitable[object]],
    *,
    trigger_type: str = "scheduled",
) -> dict | None:
    """Run a scheduled job with durable execution tracking."""
    run_id = str(uuid4())
    job_run = await _record_job_start(job_name=job_name, run_id=run_id, trigger_type=trigger_type)
    logger.info(
        "scheduler_job_started",
        job_name=job_name,
        run_id=run_id,
        instance_id=PROCESS_INSTANCE_ID,
        trigger_type=trigger_type,
    )
    try:
        result = _normalize_result(await job_func())
    except Exception as exc:
        await _record_job_finish(job_run_id=job_run.id, status="failed", error_message=str(exc))
        logger.exception(
            "scheduler_job_failed",
            job_name=job_name,
            run_id=run_id,
            instance_id=PROCESS_INSTANCE_ID,
            error_message=str(exc),
        )
        raise

    await _record_job_finish(job_run_id=job_run.id, status="succeeded", result_json=result)
    logger.info(
        "scheduler_job_succeeded",
        job_name=job_name,
        run_id=run_id,
        instance_id=PROCESS_INSTANCE_ID,
        result=result,
    )
    return result


async def execute_tracked_job_with_session(
    db: AsyncSession,
    job_name: str,
    job_func: Callable[[AsyncSession], Awaitable[object]],
    *,
    trigger_type: str = "manual",
) -> dict | None:
    """Run a tracked job using an existing session, for request-driven manual operations."""
    run_id = str(uuid4())
    job_run = SchedulerJobRun(
        job_name=job_name,
        run_id=run_id,
        status="running",
        trigger_type=trigger_type,
        instance_id=PROCESS_INSTANCE_ID,
        started_at=utc_now(),
    )
    db.add(job_run)
    await db.commit()
    await db.refresh(job_run)
    logger.info(
        "scheduler_job_started",
        job_name=job_name,
        run_id=run_id,
        instance_id=PROCESS_INSTANCE_ID,
        trigger_type=trigger_type,
    )

    try:
        result = _normalize_result(await job_func(db))
    except Exception as exc:
        await db.rollback()
        tracked_run = await db.get(SchedulerJobRun, job_run.id)
        if tracked_run is not None:
            tracked_run.status = "failed"
            tracked_run.finished_at = utc_now()
            tracked_run.duration_ms = _compute_duration_ms(tracked_run.started_at)
            tracked_run.error_message = str(exc)
            db.add(tracked_run)
            await db.commit()
        logger.exception(
            "scheduler_job_failed",
            job_name=job_name,
            run_id=run_id,
            instance_id=PROCESS_INSTANCE_ID,
            error_message=str(exc),
        )
        raise

    tracked_run = await db.get(SchedulerJobRun, job_run.id)
    if tracked_run is not None:
        tracked_run.status = "succeeded"
        tracked_run.finished_at = utc_now()
        tracked_run.duration_ms = _compute_duration_ms(tracked_run.started_at)
        tracked_run.result_json = result
        tracked_run.error_message = None
        db.add(tracked_run)
        await db.commit()
    logger.info(
        "scheduler_job_succeeded",
        job_name=job_name,
        run_id=run_id,
        instance_id=PROCESS_INSTANCE_ID,
        result=result,
    )
    return result


async def _kri_check_job() -> object:
    async with get_db_context() as db:
        return await KRIDeadlineService.check_kri_deadlines(db)


async def run_kri_check():
    """Background job: Check KRI deadlines and generate notifications."""
    return await execute_tracked_job("kri_deadline_check", _kri_check_job)


async def _questionnaire_check_job() -> object:
    async with get_db_context() as db:
        return await QuestionnaireDeadlineService.check_questionnaire_deadlines(db)


async def run_questionnaire_check():
    """Background job: Check questionnaire deadlines and generate notifications."""
    return await execute_tracked_job("questionnaire_deadline_check", _questionnaire_check_job)


async def _vendor_reassessment_check_job() -> object:
    async with get_db_context() as db:
        return await VendorReassessmentService.check_vendor_reassessments(db)


async def run_vendor_reassessment_check():
    """Background job: Check vendor reassessment deadlines and generate notifications."""
    return await execute_tracked_job("vendor_reassessment_check", _vendor_reassessment_check_job)


async def _vendor_sla_check_job() -> object:
    async with get_db_context() as db:
        return await VendorSLADeadlineService.check_vendor_sla_deadlines(db)


async def run_vendor_sla_check():
    """Background job: Check vendor SLA deadlines/breaches and generate notifications."""
    return await execute_tracked_job("vendor_sla_check", _vendor_sla_check_job)


async def _vendor_signal_refresh_job() -> object:
    from app.core.config import get_settings

    settings = get_settings()
    if not getattr(settings, "vendor_signals_public_registry_base_url", None):
        logger.info("scheduler_job_skipped", job_name="vendor_signal_refresh", reason="no_registry_base_url")
        return {"status": "skipped", "reason": "no_registry_base_url"}

    async with get_db_context() as db:
        vendors = (
            await db.execute(
                select(Vendor)
                .where(Vendor.status == "active")
                .where(Vendor.registration_id.isnot(None))
                .limit(200)
            )
        ).scalars().all()

        refreshed = 0
        for vendor in vendors:
            await VendorSignalService.refresh_vendor_signals(db, vendor=vendor, force=False)
            refreshed += 1
        return {"refreshed": refreshed}


async def run_vendor_signal_refresh():
    """Background job: Refresh optional external vendor signals."""
    return await execute_tracked_job("vendor_signal_refresh", _vendor_signal_refresh_job)


async def _issue_deadline_check_job() -> object:
    async with get_db_context() as db:
        return await IssueDeadlineService.check_issue_deadlines(db)


async def run_issue_deadline_check():
    """Background job: Check issue deadlines/exceptions and generate notifications."""
    return await execute_tracked_job("issue_deadline_check", _issue_deadline_check_job)


async def _ad_deprovision_check_job() -> object:
    from app.core.config import get_settings
    from app.services.ad_deprovision_service import ADDeprovisionService

    settings = get_settings()
    async with get_db_context() as db:
        return await ADDeprovisionService.check_all_users(
            db,
            settings=settings,
            actor=None,
            trigger="scheduler",
        )


async def run_ad_deprovision_check():
    """Background job: Check external-directory users and auto-deprovision missing accounts."""
    return await execute_tracked_job("ad_deprovision_check", _ad_deprovision_check_job)


async def _orphan_scan_job() -> object:
    async with get_db_context() as db:
        flagged = await OrphanedItemService.scan_uncategorised_items(db)
        return {"flagged": flagged}


async def run_orphan_scan(*, trigger_type: str = "scheduled"):
    """Background job: Scan uncategorised items and refresh orphan governance data."""
    return await execute_tracked_job("orphan_scan", _orphan_scan_job, trigger_type=trigger_type)


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


def get_scheduler_runtime_state() -> dict[str, object]:
    lock_provider = _lock_provider.provider_name if _lock_provider is not None else None
    enable = os.getenv("ENABLE_SCHEDULER", "false").lower() == "true"
    return {
        "process_role": "scheduler" if enable else "api",
        "instance_id": PROCESS_INSTANCE_ID,
        "process_started_at": PROCESS_STARTED_AT.isoformat(),
        "scheduler_enabled": enable,
        "scheduler_running": scheduler.running,
        "lock_provider": lock_provider,
        "lock_acquired": bool(_lock_provider.lock_acquired) if _lock_provider is not None else False,
    }


def get_outbox_dispatch_runtime_state() -> dict[str, object | None]:
    return {
        "last_started_at": _outbox_dispatch_state["last_started_at"],
        "last_finished_at": _outbox_dispatch_state["last_finished_at"],
        "last_status": _outbox_dispatch_state["last_status"],
        "last_processed": _outbox_dispatch_state["last_processed"],
        "last_error": _outbox_dispatch_state["last_error"],
    }


async def run_outbox_dispatch() -> None:
    """Dispatch queued outbox events without flooding the scheduler run ledger."""
    if _db_sessionmaker is None:
        logger.warning("outbox_dispatch_skipped", reason="db_sessionmaker_not_configured")
        return
    started_at = utc_now()
    _outbox_dispatch_state["last_started_at"] = started_at.isoformat()
    _outbox_dispatch_state["last_status"] = "running"
    _outbox_dispatch_state["last_error"] = None
    try:
        processed = await dispatch_pending_outbox_events(
            _db_sessionmaker,
            lock_owner=PROCESS_INSTANCE_ID,
        )
        finished_at = utc_now()
        _outbox_dispatch_state["last_finished_at"] = finished_at.isoformat()
        _outbox_dispatch_state["last_status"] = "succeeded"
        _outbox_dispatch_state["last_processed"] = processed
        if processed:
            logger.info("outbox_dispatch_completed", processed=processed, instance_id=PROCESS_INSTANCE_ID)
    except Exception as exc:
        finished_at = utc_now()
        _outbox_dispatch_state["last_finished_at"] = finished_at.isoformat()
        _outbox_dispatch_state["last_status"] = "failed"
        _outbox_dispatch_state["last_error"] = str(exc)
        logger.exception(
            "outbox_dispatch_failed",
            instance_id=PROCESS_INSTANCE_ID,
            error_message=str(exc),
        )


def setup_scheduler():
    """Configure scheduled jobs."""
    from app.core.config import get_settings

    settings = get_settings()
    scheduler.remove_all_jobs()

    # Daily KRI check at 8:00 AM
    scheduler.add_job(
        run_kri_check,
        CronTrigger(hour=8, minute=0),
        id="kri_deadline_check",
        name="Daily KRI Deadline Check",
        replace_existing=True,
    )
    # Daily questionnaire check at 8:05 AM
    scheduler.add_job(
        run_questionnaire_check,
        CronTrigger(hour=8, minute=5),
        id="questionnaire_deadline_check",
        name="Daily Questionnaire Deadline Check",
        replace_existing=True,
    )
    # Daily vendor reassessment check at 8:10 AM
    scheduler.add_job(
        run_vendor_reassessment_check,
        CronTrigger(hour=8, minute=10),
        id="vendor_reassessment_check",
        name="Daily Vendor Reassessment Check",
        replace_existing=True,
    )
    # Daily vendor SLA check at 8:15 AM
    scheduler.add_job(
        run_vendor_sla_check,
        CronTrigger(hour=8, minute=15),
        id="vendor_sla_check",
        name="Daily Vendor SLA Check",
        replace_existing=True,
    )
    # Daily vendor signals refresh at 8:20 AM (optional connectors)
    scheduler.add_job(
        run_vendor_signal_refresh,
        CronTrigger(hour=8, minute=20),
        id="vendor_signal_refresh",
        name="Daily Vendor External Signal Refresh",
        replace_existing=True,
    )
    # Daily issue deadline check at 8:25 AM
    scheduler.add_job(
        run_issue_deadline_check,
        CronTrigger(hour=8, minute=25),
        id="issue_deadline_check",
        name="Daily Issue Deadline Check",
        replace_existing=True,
    )
    # Daily AD deprovision check (config-driven)
    scheduler.add_job(
        run_ad_deprovision_check,
        CronTrigger(hour=settings.ad_deprovision_check_hour, minute=settings.ad_deprovision_check_minute),
        id="ad_deprovision_check",
        name="Daily AD Deprovision Check",
        replace_existing=True,
    )
    scheduler.add_job(
        run_orphan_scan,
        CronTrigger(hour=8, minute=30),
        id="orphan_scan",
        name="Daily Orphan Governance Scan",
        replace_existing=True,
    )
    scheduler.add_job(
        run_outbox_dispatch,
        IntervalTrigger(seconds=OUTBOX_DISPATCH_INTERVAL_SECONDS),
        id="outbox_dispatch",
        name="Outbox Dispatch",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    logger.info(
        "Scheduler configured: KRI/questionnaire/vendor/issue/AD-deprovision/orphan checks scheduled daily"
    )


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

    enable = os.getenv("ENABLE_SCHEDULER", "false").lower()
    if enable != "true":
        logger.info("scheduler_disabled", scheduler_enabled=False, instance_id=PROCESS_INSTANCE_ID)
        return
    if _db_sessionmaker is None:
        logger.warning("scheduler_not_started", reason="db_sessionmaker_not_configured", instance_id=PROCESS_INSTANCE_ID)
        return
    if _db_engine is None:
        logger.warning("scheduler_not_started", reason="db_engine_not_configured", instance_id=PROCESS_INSTANCE_ID)
        return

    if scheduler.running:
        return

    _lock_provider = _resolve_lock_provider()
    lock_acquired = await _lock_provider.acquire()
    logger.info(
        "scheduler_lock_attempt",
        scheduler_enabled=True,
        instance_id=PROCESS_INSTANCE_ID,
        lock_provider=_lock_provider.provider_name,
        lock_acquired=lock_acquired,
    )
    if not lock_acquired:
        return

    setup_scheduler()
    scheduler.start()
    await _mark_runtime_started()
    logger.info(
        "scheduler_started",
        scheduler_enabled=True,
        instance_id=PROCESS_INSTANCE_ID,
        lock_provider=_lock_provider.provider_name,
        lock_acquired=True,
    )


def stop_scheduler():
    """Stop the scheduler. Call during app shutdown."""
    raise RuntimeError("stop_scheduler is async; call await stop_scheduler_async() instead")


async def stop_scheduler_async() -> None:
    """Stop the scheduler and release runtime ownership."""
    global _lock_provider
    global _runtime_run_id

    if scheduler.running:
        scheduler.shutdown(wait=False)
        await _mark_runtime_stopped()
        logger.info("scheduler_stopped", instance_id=PROCESS_INSTANCE_ID)

    if _lock_provider is not None:
        await _lock_provider.release()
        _lock_provider = None

    _runtime_run_id = None
