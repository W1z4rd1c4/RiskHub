"""KRI deadline and breach checking service for generating notifications."""
import logging
from datetime import datetime, timedelta, UTC
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.models.role import RoleType
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class KRIDeadlineService:
    """Service for checking KRI deadlines and breach status, generating notifications."""
    
    # Threshold for "near breach" - 80% towards limit
    NEAR_BREACH_THRESHOLD = 0.80
    
    # Lookback period to prevent duplicate notifications (days)
    DUPLICATE_LOOKBACK_DAYS = 7
    
    @staticmethod
    async def check_kri_deadlines(db: AsyncSession) -> dict[str, int]:
        """
        Check all KRIs and generate notifications for:
        1. Near breach (value >= 80% towards upper limit)
        2. Breached (value exceeds limits)
        
        Returns counts by notification type.
        
        Note: The current KRI model doesn't have a reporting_deadline field,
        so this focuses on breach/near-breach detection. If deadlines are added
        to the model, deadline checks can be added here.
        """
        results = {
            "near_breach": 0,
            "breached": 0,
            "total_kris_checked": 0,
            "notifications_created": 0,
        }
        
        # Fetch all KRIs with their relationships
        stmt = (
            select(KeyRiskIndicator)
            .options(selectinload(KeyRiskIndicator.risk))
        )
        result = await db.execute(stmt)
        kris = result.scalars().all()
        
        results["total_kris_checked"] = len(kris)
        
        # Get all Risk Managers/CROs for escalation
        risk_managers = await KRIDeadlineService._get_risk_managers(db)
        
        for kri in kris:
            try:
                # Check breach status
                breach_status = kri.breach_status
                
                if breach_status in ("above", "below"):
                    # KRI is breached - notify
                    if not await KRIDeadlineService._check_duplicate_notification(
                        db, kri.id, NotificationType.KRI_OVERDUE
                    ):
                        # Notify owner (risk owner if available)
                        owner_id = kri.risk.owner_id if kri.risk else None
                        if owner_id:
                            await NotificationService.create_notification(
                                db=db,
                                user_id=owner_id,
                                notification_type=NotificationType.KRI_OVERDUE,
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
                                    notification_type=NotificationType.KRI_OVERDUE,
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
                        # Calculate how close to upper limit
                        threshold_value = kri.lower_limit + (range_size * KRIDeadlineService.NEAR_BREACH_THRESHOLD)
                        
                        if kri.current_value >= threshold_value:
                            if not await KRIDeadlineService._check_duplicate_notification(
                                db, kri.id, NotificationType.KRI_NEAR_BREACH
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
