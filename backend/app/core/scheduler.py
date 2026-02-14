"""Background task scheduler for KRI deadline checking and other periodic tasks."""
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.db.session import async_session_maker
from app.models.vendor import Vendor
from app.services.issue_deadline_service import IssueDeadlineService
from app.services.kri_deadline_service import KRIDeadlineService
from app.services.questionnaire_deadline_service import QuestionnaireDeadlineService
from app.services.vendor_reassessment_service import VendorReassessmentService
from app.services.vendor_signal_service import VendorSignalService
from app.services.vendor_sla_deadline_service import VendorSLADeadlineService

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def get_db_context():
    """Context manager for database session in scheduler jobs."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def run_kri_check():
    """Background job: Check KRI deadlines and generate notifications."""
    logger.info("Starting scheduled KRI deadline check...")
    try:
        async with get_db_context() as db:
            result = await KRIDeadlineService.check_kri_deadlines(db)
            logger.info(f"KRI deadline check complete: {result}")
    except Exception as e:
        logger.error(f"KRI deadline check failed: {e}")


async def run_questionnaire_check():
    """Background job: Check questionnaire deadlines and generate notifications."""
    logger.info("Starting scheduled questionnaire deadline check...")
    try:
        async with get_db_context() as db:
            result = await QuestionnaireDeadlineService.check_questionnaire_deadlines(db)
            logger.info(f"Questionnaire deadline check complete: {result}")
    except Exception as e:
        logger.error(f"Questionnaire deadline check failed: {e}")


async def run_vendor_reassessment_check():
    """Background job: Check vendor reassessment deadlines and generate notifications."""
    logger.info("Starting scheduled vendor reassessment check...")
    try:
        async with get_db_context() as db:
            result = await VendorReassessmentService.check_vendor_reassessments(db)
            logger.info(f"Vendor reassessment check complete: {result}")
    except Exception as e:
        logger.error(f"Vendor reassessment check failed: {e}")


async def run_vendor_sla_check():
    """Background job: Check vendor SLA deadlines/breaches and generate notifications."""
    logger.info("Starting scheduled vendor SLA check...")
    try:
        async with get_db_context() as db:
            result = await VendorSLADeadlineService.check_vendor_sla_deadlines(db)
            logger.info(f"Vendor SLA check complete: {result}")
    except Exception as e:
        logger.error(f"Vendor SLA check failed: {e}")


async def run_vendor_signal_refresh():
    """Background job: Refresh optional external vendor signals."""
    logger.info("Starting scheduled vendor signal refresh...")
    try:
        from app.core.config import get_settings

        settings = get_settings()
        if not getattr(settings, "vendor_signals_public_registry_base_url", None):
            logger.info("Vendor signal refresh skipped (no public registry base URL configured)")
            return

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
            for v in vendors:
                await VendorSignalService.refresh_vendor_signals(db, vendor=v, force=False)
                refreshed += 1
            logger.info(f"Vendor signal refresh complete: refreshed={refreshed}")
    except Exception as e:
        logger.error(f"Vendor signal refresh failed: {e}")


async def run_issue_deadline_check():
    """Background job: Check issue deadlines/exceptions and generate notifications."""
    logger.info("Starting scheduled issue deadline check...")
    try:
        async with get_db_context() as db:
            result = await IssueDeadlineService.check_issue_deadlines(db)
            logger.info(f"Issue deadline check complete: {result}")
    except Exception as e:
        logger.error(f"Issue deadline check failed: {e}")


def setup_scheduler():
    """Configure scheduled jobs."""
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
    logger.info("Scheduler configured: KRI/questionnaire/vendor/issue checks scheduled daily")


def start_scheduler():
    """
    Start the scheduler. Call during app startup.
    
    Multi-worker safety: Only starts if ENABLE_SCHEDULER=true.
    In production with multiple Uvicorn/Gunicorn workers, set ENABLE_SCHEDULER=true
    on exactly ONE worker process to avoid duplicate job executions.
    """
    import os
    enable = os.getenv("ENABLE_SCHEDULER", "false").lower()
    if enable != "true":
        logger.info("Scheduler disabled (ENABLE_SCHEDULER != 'true')")
        return
    
    if not scheduler.running:
        setup_scheduler()
        scheduler.start()
        logger.info("Background scheduler started (ENABLE_SCHEDULER=true)")


def stop_scheduler():
    """Stop the scheduler. Call during app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Background scheduler stopped")
