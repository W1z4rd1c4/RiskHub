from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import can_read_vendor_id
from app.i18n import t
from app.models import User, Vendor
from app.models.notification import Notification, NotificationType
from app.models.role import Role, RolePermission, RoleType
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class VendorReassessmentService:
    DUE_SOON_DAYS = 30
    DUPLICATE_LOOKBACK_DAYS = 7
    REMINDER_COOLDOWN_DAYS = 7

    @staticmethod
    def default_cadence_months(vendor: Vendor) -> int:
        return 12 if vendor.supports_important_core_insurance_function else 36

    @staticmethod
    def add_months(dt: datetime, months: int) -> datetime:
        dt = coerce_utc(dt) or dt
        year = dt.year
        month = dt.month + months
        year += (month - 1) // 12
        month = ((month - 1) % 12) + 1
        last_day = calendar.monthrange(year, month)[1]
        day = min(dt.day, last_day)
        return dt.replace(year=year, month=month, day=day)

    @staticmethod
    def compute_next_due(*, base: datetime, cadence_months: int) -> datetime:
        return VendorReassessmentService.add_months(base, cadence_months)

    @staticmethod
    async def _check_duplicate_notification(
        db: AsyncSession,
        *,
        vendor_id: int,
        notification_type: NotificationType,
        now: datetime,
        lookback_days: int,
    ) -> bool:
        cutoff_date = now - timedelta(days=lookback_days)
        stmt = (
            select(Notification)
            .where(
                and_(
                    Notification.resource_type == "vendor",
                    Notification.resource_id == vendor_id,
                    Notification.type == notification_type,
                    Notification.created_at >= cutoff_date,
                )
            )
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def _users_by_roles(db: AsyncSession, roles: set[RoleType]) -> list[User]:
        role_names = [r.value for r in roles]
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        stmt = (
            select(User)
            .join(Role, User.role_id == Role.id)
            .options(permission_load)
            .where(User.is_active.is_(True))
            .where(Role.name.in_(role_names))
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def check_vendor_reassessments(db: AsyncSession, *, now: datetime | None = None) -> dict[str, int]:
        """
        Daily job: notify outsourcing owners about vendors due soon or overdue.

        Idempotency:
        - Uses last_reassessment_reminded_at cooldown
        - Also checks Notification duplicates for vendor within lookback window
        """
        now = coerce_utc(now) or utc_now()
        today = now.date()
        due_soon_threshold = today + timedelta(days=VendorReassessmentService.DUE_SOON_DAYS)
        cooldown_cutoff = now - timedelta(days=VendorReassessmentService.REMINDER_COOLDOWN_DAYS)

        results = {
            "due_soon": 0,
            "overdue": 0,
            "total_checked": 0,
            "notifications_created": 0,
        }

        stmt = select(Vendor).where(Vendor.status == "active")
        result = await db.execute(stmt)
        vendors = result.scalars().all()
        results["total_checked"] = len(vendors)

        risk_managers = await VendorReassessmentService._users_by_roles(db, {RoleType.RISK_MANAGER})

        for vendor in vendors:
            try:
                if not vendor.next_reassessment_due_at:
                    continue

                due_at = coerce_utc(vendor.next_reassessment_due_at) or vendor.next_reassessment_due_at
                due_date = due_at.date()

                if vendor.last_reassessment_reminded_at:
                    last_reminded = (
                        coerce_utc(vendor.last_reassessment_reminded_at) or vendor.last_reassessment_reminded_at
                    )
                    if last_reminded >= cooldown_cutoff:
                        continue

                owner_id = vendor.outsourcing_owner_user_id
                if not owner_id:
                    continue

                permission_load = (
                    selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
                )
                owner_result = await db.execute(select(User).options(permission_load).where(User.id == owner_id))
                owner = owner_result.scalar_one_or_none()
                if not owner or not owner.is_active:
                    continue
                if not await can_read_vendor_id(db, owner, vendor.id):
                    continue

                locale = getattr(owner, "preferred_language", None) or "en"
                due_date_str = due_date.isoformat()

                # Due soon
                if due_date <= due_soon_threshold and due_date >= today:
                    if not await VendorReassessmentService._check_duplicate_notification(
                        db,
                        vendor_id=vendor.id,
                        notification_type=NotificationType.VENDOR_REASSESSMENT_DUE_SOON,
                        now=now,
                        lookback_days=VendorReassessmentService.DUPLICATE_LOOKBACK_DAYS,
                    ):
                        created = await NotificationService.create_notification(
                            db=db,
                            user_id=owner.id,
                            notification_type=NotificationType.VENDOR_REASSESSMENT_DUE_SOON,
                            title=t("notifications.vendor_reassessment_due_soon_title", locale=locale),
                            message=t(
                                "notifications.vendor_reassessment_due_soon_message",
                                locale=locale,
                                vendor_name=vendor.name,
                                due_date=due_date_str,
                            ),
                            resource_type="vendor",
                            resource_id=vendor.id,
                            created_at=now,
                        )
                        if created:
                            results["notifications_created"] += 1
                            results["due_soon"] += 1

                        for rm in risk_managers:
                            if rm.id == owner.id:
                                continue
                            if not await can_read_vendor_id(db, rm, vendor.id):
                                continue
                            rm_locale = getattr(rm, "preferred_language", None) or "en"
                            created_rm = await NotificationService.create_notification(
                                db=db,
                                user_id=rm.id,
                                notification_type=NotificationType.VENDOR_REASSESSMENT_DUE_SOON,
                                title=t("notifications.vendor_reassessment_due_soon_title", locale=rm_locale),
                                message=t(
                                    "notifications.vendor_reassessment_due_soon_message",
                                    locale=rm_locale,
                                    vendor_name=vendor.name,
                                    due_date=due_date_str,
                                ),
                                resource_type="vendor",
                                resource_id=vendor.id,
                                created_at=now,
                            )
                            if created_rm:
                                results["notifications_created"] += 1

                        vendor.last_reassessment_reminded_at = now

                # Overdue
                if due_date < today:
                    if not await VendorReassessmentService._check_duplicate_notification(
                        db,
                        vendor_id=vendor.id,
                        notification_type=NotificationType.VENDOR_REASSESSMENT_OVERDUE,
                        now=now,
                        lookback_days=VendorReassessmentService.DUPLICATE_LOOKBACK_DAYS,
                    ):
                        created = await NotificationService.create_notification(
                            db=db,
                            user_id=owner.id,
                            notification_type=NotificationType.VENDOR_REASSESSMENT_OVERDUE,
                            title=t("notifications.vendor_reassessment_overdue_title", locale=locale),
                            message=t(
                                "notifications.vendor_reassessment_overdue_message",
                                locale=locale,
                                vendor_name=vendor.name,
                                due_date=due_date_str,
                            ),
                            resource_type="vendor",
                            resource_id=vendor.id,
                            created_at=now,
                        )
                        if created:
                            results["notifications_created"] += 1
                            results["overdue"] += 1

                        for rm in risk_managers:
                            if rm.id == owner.id:
                                continue
                            if not await can_read_vendor_id(db, rm, vendor.id):
                                continue
                            rm_locale = getattr(rm, "preferred_language", None) or "en"
                            created_rm = await NotificationService.create_notification(
                                db=db,
                                user_id=rm.id,
                                notification_type=NotificationType.VENDOR_REASSESSMENT_OVERDUE,
                                title=t("notifications.vendor_reassessment_overdue_title", locale=rm_locale),
                                message=t(
                                    "notifications.vendor_reassessment_overdue_message",
                                    locale=rm_locale,
                                    vendor_name=vendor.name,
                                    due_date=due_date_str,
                                ),
                                resource_type="vendor",
                                resource_id=vendor.id,
                                created_at=now,
                            )
                            if created_rm:
                                results["notifications_created"] += 1

                        vendor.last_reassessment_reminded_at = now

            except Exception as e:
                logger.error(f"Error checking vendor reassessment for vendor {getattr(vendor, 'id', None)}: {e}")
                continue

        await db.commit()
        return results
