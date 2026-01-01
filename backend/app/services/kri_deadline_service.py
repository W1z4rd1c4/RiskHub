"""KRI deadline and breach checking service for generating notifications."""
import logging
from datetime import datetime, date, timedelta, UTC
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.models.role import RoleType
from app.services.kri_history_service import KRIHistoryService
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class KRIDeadlineService:
    """Service for checking KRI deadlines and breach status, generating notifications."""
    
    # Threshold for "near breach" - 80% towards limit
    NEAR_BREACH_THRESHOLD = 0.80
    
    # Lookback period to prevent duplicate notifications (days)
    DUPLICATE_LOOKBACK_DAYS = 7
    
    # Reporting grace window (days after period end)
    REPORTING_GRACE_DAYS = 15
    
    # Advance reminder days before period end
    ADVANCE_REMINDER_DAYS = 7
    
    # Overdue reminder interval (weeks)
    OVERDUE_REMINDER_WEEKS = 1
    
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
    async def check_kri_deadlines(db: AsyncSession) -> dict[str, int]:
        """
        Check all KRIs and generate notifications for:
        1. Due soon (advance reminder before period end)
        2. Deadline (on due date - period_end + 15 days)
        3. Overdue (every 7 weeks after due date if not updated)
        4. Near breach (value >= 80% towards upper limit)
        5. Breached (value exceeds limits)
        
        Returns counts by notification type.
        """
        results = {
            "due_soon": 0,
            "deadline": 0,
            "overdue": 0,
            "near_breach": 0,
            "breached": 0,
            "total_kris_checked": 0,
            "notifications_created": 0,
        }
        
        today = date.today()
        
        # Fetch all KRIs with their relationships
        stmt = (
            select(KeyRiskIndicator)
            .options(
                selectinload(KeyRiskIndicator.risk),
                selectinload(KeyRiskIndicator.reporting_owner),
            )
        )
        result = await db.execute(stmt)
        kris = result.scalars().all()
        
        results["total_kris_checked"] = len(kris)
        
        # Get all Risk Managers/CROs for escalation
        risk_managers = await KRIDeadlineService._get_risk_managers(db)
        
        for kri in kris:
            try:
                _, current_period_end = KRIHistoryService.period_bounds_for_date(today, kri.frequency)
                _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, kri.frequency)
                
                if kri.last_period_end and kri.last_period_end >= latest_closed_end:
                    period_end = current_period_end
                else:
                    period_end = latest_closed_end
                
                due = KRIDeadlineService._due_date(period_end)
                reporting_owner = KRIDeadlineService._reporting_owner_id(kri)
                
                # Check if already reported for this period
                already_reported = kri.last_period_end and kri.last_period_end >= period_end
                
                if not already_reported:
                    # === REPORTING DEADLINE CHECKS ===
                    
                    # 1. Advance reminder (7 days before period end)
                    advance_date = period_end - timedelta(days=KRIDeadlineService.ADVANCE_REMINDER_DAYS)
                    if today == advance_date:
                        if reporting_owner and not await KRIDeadlineService._check_duplicate_notification(
                            db, kri.id, NotificationType.KRI_DUE_SOON, lookback_days=7
                        ):
                            await NotificationService.create_notification(
                                db=db,
                                user_id=reporting_owner,
                                notification_type=NotificationType.KRI_DUE_SOON,
                                title=f"KRI Reporting Due Soon: {kri.metric_name[:50]}",
                                message=f"KRI '{kri.metric_name}' reporting period ends on {period_end.isoformat()}. Please submit your value within {KRIDeadlineService.REPORTING_GRACE_DAYS} days after that.",
                                resource_type="kri",
                                resource_id=kri.id,
                            )
                            results["notifications_created"] += 1
                            results["due_soon"] += 1
                    
                    # 2. Deadline notification (on due date)
                    elif today == due:
                        if reporting_owner and not await KRIDeadlineService._check_duplicate_notification(
                            db, kri.id, NotificationType.KRI_DUE_TOMORROW, lookback_days=7
                        ):
                            await NotificationService.create_notification(
                                db=db,
                                user_id=reporting_owner,
                                notification_type=NotificationType.KRI_DUE_TOMORROW,
                                title=f"KRI Reporting Deadline: {kri.metric_name[:50]}",
                                message=f"Today is the deadline for reporting KRI '{kri.metric_name}' for period ending {period_end.isoformat()}. Please submit your value now.",
                                resource_type="kri",
                                resource_id=kri.id,
                            )
                            results["notifications_created"] += 1
                            results["deadline"] += 1
                    
                    # 3. Overdue reminder (every 7 weeks after due date)
                    elif today > due:
                        days_overdue = (today - due).days
                        overdue_weeks = days_overdue // 7
                        
                        # Send reminder every week (7 days)
                        if overdue_weeks > 0 and overdue_weeks % KRIDeadlineService.OVERDUE_REMINDER_WEEKS == 0:
                            if reporting_owner and not await KRIDeadlineService._check_duplicate_notification(
                                db, kri.id, NotificationType.KRI_OVERDUE, lookback_days=7
                            ):
                                await NotificationService.create_notification(
                                    db=db,
                                    user_id=reporting_owner,
                                    notification_type=NotificationType.KRI_OVERDUE,
                                    title=f"KRI Overdue ({days_overdue}d): {kri.metric_name[:50]}",
                                    message=f"KRI '{kri.metric_name}' is {days_overdue} days overdue for reporting. Period ended {period_end.isoformat()}, due date was {due.isoformat()}.",
                                    resource_type="kri",
                                    resource_id=kri.id,
                                )
                                results["notifications_created"] += 1
                                results["overdue"] += 1
                
                # === BREACH CHECKS (existing logic) ===
                breach_status = kri.breach_status
                
                if breach_status in ("above", "below"):
                    # KRI is breached - notify
                    if not await KRIDeadlineService._check_duplicate_notification(
                        db, kri.id, NotificationType.KRI_BREACH_DETECTED, lookback_days=7
                    ):
                        owner_id = kri.risk.owner_id if kri.risk else None
                        if owner_id:
                            await NotificationService.create_notification(
                                db=db,
                                user_id=owner_id,
                                notification_type=NotificationType.KRI_BREACH_DETECTED,
                                title=f"KRI Breached: {kri.metric_name[:50]}",
                                message=f"KRI '{kri.metric_name}' is {breach_status} limit. Current: {kri.current_value}, Limits: [{kri.lower_limit}, {kri.upper_limit}]",
                                resource_type="kri",
                                resource_id=kri.id,
                            )
                            results["notifications_created"] += 1
                        
                        # Also notify risk managers for escalation
                        for rm in risk_managers:
                            if rm.id != owner_id:
                                await NotificationService.create_notification(
                                    db=db,
                                    user_id=rm.id,
                                    notification_type=NotificationType.KRI_BREACH_DETECTED,
                                    title=f"KRI Breached: {kri.metric_name[:50]}",
                                    message=f"KRI '{kri.metric_name}' is {breach_status} limit. Current: {kri.current_value}, Limits: [{kri.lower_limit}, {kri.upper_limit}]",
                                    resource_type="kri",
                                    resource_id=kri.id,
                                )
                                results["notifications_created"] += 1
                        
                        results["breached"] += 1
                
                else:
                    # Check if near breach (within 80% of upper limit)
                    range_size = kri.upper_limit - kri.lower_limit
                    if range_size > 0:
                        threshold_value = kri.lower_limit + (range_size * KRIDeadlineService.NEAR_BREACH_THRESHOLD)
                        
                        if kri.current_value >= threshold_value:
                            if not await KRIDeadlineService._check_duplicate_notification(
                                db, kri.id, NotificationType.KRI_NEAR_BREACH, lookback_days=7
                            ):
                                owner_id = kri.risk.owner_id if kri.risk else None
                                if owner_id:
                                    await NotificationService.create_notification(
                                        db=db,
                                        user_id=owner_id,
                                        notification_type=NotificationType.KRI_NEAR_BREACH,
                                        title=f"KRI Near Breach: {kri.metric_name[:50]}",
                                        message=f"KRI '{kri.metric_name}' is approaching upper limit. Current: {kri.current_value}, Upper limit: {kri.upper_limit}",
                                        resource_type="kri",
                                        resource_id=kri.id,
                                    )
                                    results["notifications_created"] += 1
                                    results["near_breach"] += 1
                                    
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
        approver_roles = {RoleType.RISK_MANAGER, RoleType.CRO, RoleType.ADMIN}
        
        stmt = (
            select(User)
            .options(selectinload(User.role))
            .where(User.is_active == True)
        )
        result = await db.execute(stmt)
        all_users = result.scalars().all()
        
        return [u for u in all_users if u.role and u.role.name in approver_roles]
