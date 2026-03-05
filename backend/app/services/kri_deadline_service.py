"""KRI deadline and breach checking service for generating notifications."""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_kri_id
from app.models.global_config import ConfigDefaults
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services.kri_deadline_support import (
    initialize_results,
    list_active_kris,
    list_risk_managers,
    load_kri_deadline_config,
)
from app.services.kri_history_service import KRIHistoryService
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class KRIDeadlineService:
    """Service for checking KRI deadlines and breach status, generating notifications."""

    # Class-level defaults (used if DB config is unavailable)
    # These are now sourced from ConfigDefaults for consistency
    NEAR_BREACH_THRESHOLD = ConfigDefaults.NEAR_BREACH_THRESHOLD
    DUPLICATE_LOOKBACK_DAYS = ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
    REPORTING_GRACE_DAYS = ConfigDefaults.REPORTING_GRACE_DAYS
    ADVANCE_REMINDER_DAYS = ConfigDefaults.ADVANCE_REMINDER_DAYS
    OVERDUE_REMINDER_WEEKS = ConfigDefaults.OVERDUE_REMINDER_WEEKS

    @staticmethod
    async def _load_config(db: AsyncSession) -> dict:
        """Load notification timing config from database once."""
        return await load_kri_deadline_config(db)

    @staticmethod
    def _due_date(period_end: date) -> date:
        """Calculate due date for a period (period_end + grace days)."""
        return KRIHistoryService.due_date(period_end)

    @staticmethod
    def _reporting_owner_id(kri: KeyRiskIndicator) -> int | None:
        """Get reporting owner, falling back to risk owner."""
        if kri.reporting_owner_id:
            return kri.reporting_owner_id
        if kri.risk and kri.risk.owner_id:
            return kri.risk.owner_id
        return None

    @staticmethod
    def _resolve_period_end(kri: KeyRiskIndicator, today: date) -> date:
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, kri.frequency)
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, kri.frequency)
        if kri.last_period_end and kri.last_period_end >= latest_closed_end:
            return current_period_end
        return latest_closed_end

    @staticmethod
    async def _check_reporting_notifications(
        db: AsyncSession,
        *,
        kri: KeyRiskIndicator,
        reporting_owner: int | None,
        period_end: date,
        due: date,
        today: date,
        config: dict,
        results: dict[str, int],
    ) -> None:
        if not reporting_owner:
            return

        advance_date = period_end - timedelta(days=config["advance_reminder_days"])

        if today == advance_date:
            if not await KRIDeadlineService._check_duplicate_notification(
                db, kri.id, NotificationType.KRI_DUE_SOON, lookback_days=config["duplicate_lookback_days"]
            ):
                await NotificationService.create_notification(
                    db=db,
                    user_id=reporting_owner,
                    notification_type=NotificationType.KRI_DUE_SOON,
                    title=f"KRI Reporting Due Soon: {kri.metric_name[:50]}",
                    message=(
                        f"KRI '{kri.metric_name}' reporting period ends on {period_end.isoformat()}. "
                        "Please submit your value within "
                        f"{config['reporting_grace_days']} days after that."
                    ),
                    resource_type="kri",
                    resource_id=kri.id,
                )
                results["notifications_created"] += 1
                results["due_soon"] += 1
            return

        if today == due:
            if not await KRIDeadlineService._check_duplicate_notification(
                db,
                kri.id,
                NotificationType.KRI_DUE_TOMORROW,
                lookback_days=config["duplicate_lookback_days"],
            ):
                await NotificationService.create_notification(
                    db=db,
                    user_id=reporting_owner,
                    notification_type=NotificationType.KRI_DUE_TOMORROW,
                    title=f"KRI Reporting Deadline: {kri.metric_name[:50]}",
                    message=(
                        "Today is the deadline for reporting "
                        f"KRI '{kri.metric_name}' for period ending {period_end.isoformat()}. "
                        "Please submit your value now."
                    ),
                    resource_type="kri",
                    resource_id=kri.id,
                )
                results["notifications_created"] += 1
                results["deadline"] += 1
            return

        if today <= due:
            return

        days_overdue = (today - due).days
        overdue_weeks = days_overdue // 7
        if overdue_weeks <= 0 or overdue_weeks % config["overdue_reminder_weeks"] != 0:
            return

        if not await KRIDeadlineService._check_duplicate_notification(
            db,
            kri.id,
            NotificationType.KRI_OVERDUE,
            lookback_days=config["duplicate_lookback_days"],
        ):
            await NotificationService.create_notification(
                db=db,
                user_id=reporting_owner,
                notification_type=NotificationType.KRI_OVERDUE,
                title=f"KRI Overdue ({days_overdue}d): {kri.metric_name[:50]}",
                message=(
                    f"KRI '{kri.metric_name}' is {days_overdue} days overdue for reporting. "
                    f"Period ended {period_end.isoformat()}, due date was {due.isoformat()}."
                ),
                resource_type="kri",
                resource_id=kri.id,
            )
            results["notifications_created"] += 1
            results["overdue"] += 1

    @staticmethod
    async def _check_breach_notifications(
        db: AsyncSession,
        *,
        kri: KeyRiskIndicator,
        risk_managers: list[User],
        config: dict,
        results: dict[str, int],
    ) -> None:
        breach_status = kri.breach_status

        if breach_status in ("above", "below"):
            if await KRIDeadlineService._check_duplicate_notification(
                db,
                kri.id,
                NotificationType.KRI_BREACH_DETECTED,
                lookback_days=config["duplicate_lookback_days"],
            ):
                return

            title = f"KRI Breached: {kri.metric_name[:50]}"
            message = (
                f"KRI '{kri.metric_name}' is {breach_status} limit. "
                f"Current: {kri.current_value}, "
                f"Limits: [{kri.lower_limit}, {kri.upper_limit}]"
            )
            owner_id = kri.risk.owner_id if kri.risk else None
            if owner_id:
                await NotificationService.create_notification(
                    db=db,
                    user_id=owner_id,
                    notification_type=NotificationType.KRI_BREACH_DETECTED,
                    title=title,
                    message=message,
                    resource_type="kri",
                    resource_id=kri.id,
                )
                results["notifications_created"] += 1

            for rm in risk_managers:
                if rm.id == owner_id:
                    continue
                if not await can_read_kri_id(db, rm, kri.id):
                    continue
                await NotificationService.create_notification(
                    db=db,
                    user_id=rm.id,
                    notification_type=NotificationType.KRI_BREACH_DETECTED,
                    title=title,
                    message=message,
                    resource_type="kri",
                    resource_id=kri.id,
                )
                results["notifications_created"] += 1

            results["breached"] += 1
            return

        range_size = kri.upper_limit - kri.lower_limit
        if range_size <= 0:
            return

        threshold_value = kri.lower_limit + (range_size * config["near_breach_threshold"])
        if kri.current_value < threshold_value:
            return

        if await KRIDeadlineService._check_duplicate_notification(
            db,
            kri.id,
            NotificationType.KRI_NEAR_BREACH,
            lookback_days=config["duplicate_lookback_days"],
        ):
            return

        owner_id = kri.risk.owner_id if kri.risk else None
        if owner_id:
            await NotificationService.create_notification(
                db=db,
                user_id=owner_id,
                notification_type=NotificationType.KRI_NEAR_BREACH,
                title=f"KRI Near Breach: {kri.metric_name[:50]}",
                message=(
                    f"KRI '{kri.metric_name}' is approaching upper limit. "
                    f"Current: {kri.current_value}, Upper limit: {kri.upper_limit}"
                ),
                resource_type="kri",
                resource_id=kri.id,
            )
            results["notifications_created"] += 1
            results["near_breach"] += 1

    @staticmethod
    async def _process_single_kri(
        db: AsyncSession,
        *,
        kri: KeyRiskIndicator,
        today: date,
        config: dict,
        risk_managers: list[User],
        results: dict[str, int],
    ) -> None:
        period_end = KRIDeadlineService._resolve_period_end(kri, today)
        due = KRIDeadlineService._due_date(period_end)
        reporting_owner = KRIDeadlineService._reporting_owner_id(kri)
        already_reported = kri.last_period_end and kri.last_period_end >= period_end

        if not already_reported:
            await KRIDeadlineService._check_reporting_notifications(
                db,
                kri=kri,
                reporting_owner=reporting_owner,
                period_end=period_end,
                due=due,
                today=today,
                config=config,
                results=results,
            )

        await KRIDeadlineService._check_breach_notifications(
            db,
            kri=kri,
            risk_managers=risk_managers,
            config=config,
            results=results,
        )

    @staticmethod
    async def check_kri_deadlines(db: AsyncSession) -> dict[str, int]:
        """
        Check all KRIs and generate notifications for:
        1. Due soon (advance reminder before period end)
        2. Deadline (on due date - period_end + grace days)
        3. Overdue (every N weeks after due date if not updated)
        4. Near breach (value >= threshold towards upper limit)
        5. Breached (value exceeds limits)

        Notification timing values are sourced from global_config.

        Returns counts by notification type.
        """
        # Load config once at start
        config = await KRIDeadlineService._load_config(db)

        results = initialize_results()

        today = date.today()

        # Fetch all ACTIVE (non-archived) KRIs with their relationships
        kris = await list_active_kris(db)
        results["total_kris_checked"] = len(kris)

        # Get all Risk Managers/CROs for escalation
        risk_managers = await KRIDeadlineService._get_risk_managers(db)

        for kri in kris:
            try:
                await KRIDeadlineService._process_single_kri(
                    db,
                    kri=kri,
                    today=today,
                    config=config,
                    risk_managers=risk_managers,
                    results=results,
                )
            except Exception as e:
                logger.error(f"Error checking KRI {kri.id}: {e}")
                continue

        await db.commit()
        logger.info(f"KRI deadline check complete: {results}")
        return results

    @staticmethod
    async def _check_duplicate_notification(
        db: AsyncSession,
        kri_id: int,
        notification_type: NotificationType,
        lookback_days: int = 7,
    ) -> bool:
        """
        Check if a notification of the same type was sent for this KRI recently.
        Prevents spamming users with the same notification.

        Returns True if duplicate exists (should skip), False if OK to send.
        """
        cutoff_date = datetime.now(UTC) - timedelta(days=lookback_days)

        stmt = (
            select(Notification)
            .where(
                and_(
                    Notification.resource_type == "kri",
                    Notification.resource_id == kri_id,
                    Notification.type == notification_type,
                    Notification.created_at >= cutoff_date,
                )
            )
            .limit(1)
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        return existing is not None

    @staticmethod
    async def _get_risk_managers(db: AsyncSession) -> list[User]:
        """Get all users with Risk Manager, CRO, or Admin roles for escalation."""
        return await list_risk_managers(db)
