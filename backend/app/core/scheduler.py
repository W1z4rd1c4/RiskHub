"""Background task scheduler for KRI deadline checking and other periodic tasks."""
import logging
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db.session import async_session_maker
from app.services.kri_deadline_service import KRIDeadlineService

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
    logger.info("Scheduler configured: KRI deadline check scheduled for 8:00 AM daily")


def start_scheduler():
    """Start the scheduler. Call during app startup."""
    if not scheduler.running:
        setup_scheduler()
        scheduler.start()
        logger.info("Background scheduler started")


def stop_scheduler():
    """Stop the scheduler. Call during app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Background scheduler stopped")
