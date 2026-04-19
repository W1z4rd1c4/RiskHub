"""Scheduler job definitions and registration."""

import os

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.datetime_utils import utc_now
from app.core.logging import get_logger
from app.core.scheduler import (
    FULL_SCHEDULER_JOB_IDS,
    OUTBOX_ONLY_SCHEDULER_JOB_IDS,
    PROCESS_INSTANCE_ID,
    SCHEDULER_JOB_PROFILE_ENV,
    DEFAULT_SCHEDULER_JOB_PROFILE,
    _outbox_dispatch_state,
    execute_tracked_job,
    get_db_context,
    scheduler,
)
from app.services.issue_deadline_service import IssueDeadlineService
from app.services.kri_deadline_service import KRIDeadlineService
from app.services.orphaned_item_service import OrphanedItemService
from app.services.outbox import OUTBOX_DISPATCH_INTERVAL_SECONDS, dispatch_pending_outbox_events
from app.services.questionnaire_deadline_service import QuestionnaireDeadlineService

logger = get_logger("scheduler.jobs")

_db_sessionmaker_ref = None


def set_db_sessionmaker_ref(sessionmaker):
    """Allow scheduler.py to pass the sessionmaker reference without circular import."""
    global _db_sessionmaker_ref
    _db_sessionmaker_ref = sessionmaker


# ── Job functions ───────────────────────────────────────────────────


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


async def run_outbox_dispatch() -> None:
    """Dispatch queued outbox events without flooding the scheduler run ledger."""
    if _db_sessionmaker_ref is None:
        logger.warning("outbox_dispatch_skipped", reason="db_sessionmaker_not_configured")
        return
    started_at = utc_now()
    _outbox_dispatch_state["last_started_at"] = started_at.isoformat()
    _outbox_dispatch_state["last_status"] = "running"
    _outbox_dispatch_state["last_error"] = None
    try:
        processed = await dispatch_pending_outbox_events(
            _db_sessionmaker_ref,
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


# ── Job registration ────────────────────────────────────────────────


def _register_outbox_dispatch_job() -> None:
    scheduler.add_job(
        run_outbox_dispatch,
        IntervalTrigger(seconds=OUTBOX_DISPATCH_INTERVAL_SECONDS),
        id="outbox_dispatch",
        name="Outbox Dispatch",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )


def register_full_scheduler_jobs(settings) -> tuple[str, ...]:
    scheduler.add_job(
        run_kri_check,
        CronTrigger(hour=8, minute=0),
        id="kri_deadline_check",
        name="Daily KRI Deadline Check",
        replace_existing=True,
    )
    scheduler.add_job(
        run_questionnaire_check,
        CronTrigger(hour=8, minute=5),
        id="questionnaire_deadline_check",
        name="Daily Questionnaire Deadline Check",
        replace_existing=True,
    )
    scheduler.add_job(
        run_issue_deadline_check,
        CronTrigger(hour=8, minute=10),
        id="issue_deadline_check",
        name="Daily Issue Deadline Check",
        replace_existing=True,
    )
    scheduler.add_job(
        run_ad_deprovision_check,
        IntervalTrigger(minutes=max(int(settings.ad_deprovision_check_interval_minutes), 1)),
        id="ad_deprovision_check",
        name="AD Deprovision Check",
        replace_existing=True,
    )
    scheduler.add_job(
        run_orphan_scan,
        CronTrigger(hour=8, minute=15),
        id="orphan_scan",
        name="Daily Orphan Governance Scan",
        replace_existing=True,
    )
    _register_outbox_dispatch_job()
    return FULL_SCHEDULER_JOB_IDS


def register_outbox_only_scheduler_jobs() -> tuple[str, ...]:
    _register_outbox_dispatch_job()
    return OUTBOX_ONLY_SCHEDULER_JOB_IDS


def resolve_scheduler_job_profile() -> str:
    configured = os.getenv(SCHEDULER_JOB_PROFILE_ENV, DEFAULT_SCHEDULER_JOB_PROFILE).strip().lower()
    if configured in {DEFAULT_SCHEDULER_JOB_PROFILE, "outbox_only"}:
        return configured

    logger.warning(
        "scheduler_job_profile_invalid",
        configured_profile=configured or None,
        selected_profile=DEFAULT_SCHEDULER_JOB_PROFILE,
        instance_id=PROCESS_INSTANCE_ID,
    )
    return DEFAULT_SCHEDULER_JOB_PROFILE


def resolve_process_worker_count() -> int:
    for env_name in ("API_WORKERS", "UVICORN_WORKERS", "WEB_CONCURRENCY"):
        raw_value = os.getenv(env_name, "").strip()
        if not raw_value:
            continue
        try:
            return max(int(raw_value), 1)
        except ValueError:
            logger.warning(
                "scheduler_worker_count_invalid",
                env_name=env_name,
                configured_value=raw_value,
                selected_worker_count=1,
                instance_id=PROCESS_INSTANCE_ID,
            )
            return 1
    return 1
