"""KRI deadline and breach checking service for generating notifications."""

import logging
from datetime import date, datetime
from functools import partial

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_kri_id
from app.core.user_query_options import user_selectinload_options
from app.models.global_config import ConfigDefaults
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.notification import NotificationType
from app.models.user import User
from app.services._deadline_execution import (
    DeadlineNotificationExecutionPlan,
    VisibilityCheck,
    execute_deadline_notification_plan,
    has_recent_deadline_notification,
    increment_deadline_results,
    run_deadline_items,
)
from app.services._kri_history.constants import REPORTING_GRACE_DAYS as DEFAULT_REPORTING_GRACE_DAYS
from app.services.kri_deadline_decisions import (
    KriDeadlineNotificationPlan,
    build_kri_limit_notification_plan,
    build_kri_reporting_notification_plan,
)
from app.services.kri_deadline_support import (
    initialize_results,
    list_active_kris,
    list_risk_managers,
    load_kri_deadline_config,
)
from app.services.kri_history_service import KRIHistoryService

logger = logging.getLogger(__name__)


def _kri_item_id(kri: KeyRiskIndicator) -> int:
    return kri.id


class KRIDeadlineService:
    """Service for checking KRI deadlines and breach status, generating notifications."""

    # Class-level defaults (used if DB config is unavailable)
    # These are now sourced from ConfigDefaults for consistency
    NEAR_BREACH_THRESHOLD = ConfigDefaults.NEAR_BREACH_THRESHOLD
    DUPLICATE_LOOKBACK_DAYS = ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
    REPORTING_GRACE_DAYS = DEFAULT_REPORTING_GRACE_DAYS
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
    async def _can_read(db: AsyncSession, *, user_id: int, kri_id: int) -> bool:
        user = (
            await db.execute(
                select(User)
                .options(*user_selectinload_options(include_permissions=True))
                .where(User.id == user_id, User.is_active.is_(True))
            )
        ).scalar_one_or_none()
        if user is None:
            return False
        return await can_read_kri_id(db, user, kri_id)

    @staticmethod
    async def _execute_kri_notification(
        db: AsyncSession,
        *,
        user_id: int,
        kri_id: int,
        plan: KriDeadlineNotificationPlan,
        now: datetime,
        results: dict[str, int],
        visibility_check: VisibilityCheck,
        lookback_days: int | None = None,
    ) -> None:
        await execute_deadline_notification_plan(
            db=db,
            plan=DeadlineNotificationExecutionPlan(
                user_id=user_id,
                notification_type=plan.notification_type,
                title=plan.title,
                message=plan.message,
                resource_type="kri",
                resource_id=kri_id,
                now=now,
                lookback_days=lookback_days,
                message_contains=plan.message_contains if lookback_days is not None else None,
                visibility_check=visibility_check,
                result_bucket=plan.result_bucket,
            ),
            results=results,
        )

    @staticmethod
    async def _check_reporting_notifications(
        db: AsyncSession,
        *,
        kri: KeyRiskIndicator,
        reporting_owner: int | None,
        period_end: date,
        due: date,
        today: date,
        now: datetime,
        config: dict,
        results: dict[str, int],
    ) -> None:
        if not reporting_owner:
            return

        plan = build_kri_reporting_notification_plan(
            kri=kri,
            period_end=period_end,
            due=due,
            today=today,
            config=config,
        )
        if plan is None:
            return

        await KRIDeadlineService._execute_kri_notification(
            db,
            user_id=reporting_owner,
            kri_id=kri.id,
            plan=plan,
            now=now,
            results=results,
            lookback_days=config["duplicate_lookback_days"],
            visibility_check=partial(KRIDeadlineService._can_read, db, user_id=reporting_owner, kri_id=kri.id),
        )

    @staticmethod
    async def _check_breach_notifications(
        db: AsyncSession,
        *,
        kri: KeyRiskIndicator,
        risk_managers: list[User],
        now: datetime,
        config: dict,
        results: dict[str, int],
    ) -> None:
        plan = build_kri_limit_notification_plan(kri=kri, config=config)
        if plan is None:
            return

        if plan.notification_type == NotificationType.KRI_BREACH_DETECTED:
            if await KRIDeadlineService._check_duplicate_notification(
                db,
                kri.id,
                plan.notification_type,
                lookback_days=config["duplicate_lookback_days"],
                now=now,
                message_contains=plan.message_contains,
            ):
                return

            owner_id = kri.risk.owner_id if kri.risk else None
            if owner_id:
                breach_owner_id = owner_id

                await KRIDeadlineService._execute_kri_notification(
                    db,
                    user_id=breach_owner_id,
                    kri_id=kri.id,
                    plan=plan,
                    now=now,
                    results=results,
                    visibility_check=partial(KRIDeadlineService._can_read, db, user_id=breach_owner_id, kri_id=kri.id),
                )

            for rm in risk_managers:
                if rm.id == owner_id:
                    continue
                if not await can_read_kri_id(db, rm, kri.id):
                    continue
                await KRIDeadlineService._execute_kri_notification(
                    db,
                    user_id=rm.id,
                    kri_id=kri.id,
                    plan=plan,
                    now=now,
                    results=results,
                    visibility_check=partial(can_read_kri_id, db, rm, kri.id),
                )

            increment_deadline_results(results, "breached")
            return

        owner_id = kri.risk.owner_id if kri.risk else None
        if owner_id:
            await KRIDeadlineService._execute_kri_notification(
                db,
                user_id=owner_id,
                kri_id=kri.id,
                plan=plan,
                now=now,
                results=results,
                lookback_days=config["duplicate_lookback_days"],
                visibility_check=partial(KRIDeadlineService._can_read, db, user_id=owner_id, kri_id=kri.id),
            )

    @staticmethod
    async def _process_single_kri(
        db: AsyncSession,
        *,
        kri: KeyRiskIndicator,
        today: date,
        now: datetime,
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
                now=now,
                config=config,
                results=results,
            )

        await KRIDeadlineService._check_breach_notifications(
            db,
            kri=kri,
            risk_managers=risk_managers,
            now=now,
            config=config,
            results=results,
        )

    @staticmethod
    async def check_kri_deadlines(
        db: AsyncSession,
        *,
        today: date | None = None,
        now: datetime | None = None,
    ) -> dict[str, int]:
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

        now = now or utc_now()
        today = today or now.date()

        # Fetch all ACTIVE (non-archived) KRIs with their relationships
        kris = await list_active_kris(db)

        # Get all Risk Managers/CROs for escalation
        risk_managers = await KRIDeadlineService._get_risk_managers(db)

        async def process_kri(kri: KeyRiskIndicator) -> dict[str, int]:
            kri_results = initialize_results()
            await KRIDeadlineService._process_single_kri(
                db,
                kri=kri,
                today=today,
                now=now,
                config=config,
                risk_managers=risk_managers,
                results=kri_results,
            )
            return kri_results

        await run_deadline_items(
            db,
            items=kris,
            results=results,
            total_key="total_kris_checked",
            item_label="KRI",
            item_id=_kri_item_id,
            process_item=process_kri,
            skip_result_keys={"total_kris_checked"},
            logger=logger,
        )
        logger.info(f"KRI deadline check complete: {results}")
        return results

    @staticmethod
    async def _check_duplicate_notification(
        db: AsyncSession,
        kri_id: int,
        notification_type: NotificationType,
        lookback_days: int = 7,
        now: datetime | None = None,
        message_contains: str | None = None,
    ) -> bool:
        """
        Check if a notification of the same type was sent for this KRI recently.
        Prevents spamming users with the same notification.

        Returns True if duplicate exists (should skip), False if OK to send.
        """
        return await has_recent_deadline_notification(
            db,
            resource_type="kri",
            resource_id=kri_id,
            notification_type=notification_type,
            lookback_days=lookback_days,
            now=now or utc_now(),
            message_contains=message_contains,
        )

    @staticmethod
    async def _get_risk_managers(db: AsyncSession) -> list[User]:
        """Get all users with Risk Manager, CRO, or Admin roles for escalation."""
        return await list_risk_managers(db)
