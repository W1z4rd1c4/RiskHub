"""Vendor SLA deadline and breach checking service for generating notifications."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.i18n import t
from app.models import User
from app.models.global_config import ConfigDefaults, get_config_float, get_config_int
from app.models.notification import Notification, NotificationType
from app.models.role import Role, RolePermission, RoleType
from app.models.vendor_sla import VendorSLA
from app.services.kri_history_service import KRIHistoryService
from app.services.notification_service import NotificationService
from app.services.vendor_sla_history_service import VendorSLAHistoryService

logger = logging.getLogger(__name__)


class VendorSLADeadlineService:
    @staticmethod
    async def _load_config(db: AsyncSession) -> dict:
        return {
            "near_breach_threshold": await get_config_float(
                db, "near_breach_threshold", ConfigDefaults.NEAR_BREACH_THRESHOLD
            ),
            "duplicate_lookback_days": await get_config_int(
                db, "duplicate_lookback_days", ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
            ),
        }

    @staticmethod
    async def _check_duplicate_notification(
        db: AsyncSession,
        *,
        vendor_id: int,
        notification_type: NotificationType,
        lookback_days: int,
        now: datetime,
    ) -> bool:
        cutoff_date = (now - timedelta(days=lookback_days)).replace(tzinfo=None)
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
            .where(User.is_active == True)
            .where(Role.name.in_(role_names))
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def check_vendor_sla_deadlines(db: AsyncSession, *, now: datetime | None = None) -> dict[str, int]:
        now = now or datetime.now(UTC)
        today = date.today()

        config = await VendorSLADeadlineService._load_config(db)

        results = {
            "due_soon": 0,
            "due_tomorrow": 0,
            "overdue": 0,
            "near_breach": 0,
            "breached": 0,
            "total_checked": 0,
            "notifications_created": 0,
        }

        stmt = (
            select(VendorSLA)
            .where(VendorSLA.is_archived == False)
            .options(selectinload(VendorSLA.vendor), selectinload(VendorSLA.reporting_owner))
        )
        slas = (await db.execute(stmt)).scalars().all()
        results["total_checked"] = len(slas)

        governance_recipients = await VendorSLADeadlineService._users_by_roles(
            db, {RoleType.RISK_MANAGER, RoleType.COMPLIANCE}
        )
        visibility_cache: dict[tuple[int, int], bool] = {}

        owner_ids: set[int] = set()
        for sla in slas:
            if sla.reporting_owner_id:
                owner_ids.add(sla.reporting_owner_id)
            if sla.vendor and sla.vendor.outsourcing_owner_user_id:
                owner_ids.add(sla.vendor.outsourcing_owner_user_id)

        owners_by_id: dict[int, User] = {}
        if owner_ids:
            permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
            owners = (
                await db.execute(select(User).options(permission_load).where(User.id.in_(owner_ids)))
            ).scalars().all()
            owners_by_id = {owner.id: owner for owner in owners}

        for sla in slas:
            try:
                vendor = sla.vendor
                if not vendor:
                    continue

                reporting_owner = owners_by_id.get(sla.reporting_owner_id) if sla.reporting_owner_id else None
                if not reporting_owner and vendor.outsourcing_owner_user_id:
                    reporting_owner = owners_by_id.get(vendor.outsourcing_owner_user_id)

                if not reporting_owner:
                    continue

                _, current_period_end = KRIHistoryService.period_bounds_for_date(today, sla.frequency)
                _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, sla.frequency)

                # Use same semantics as KRIs: if reported through latest closed period, next expected is current period.
                if sla.last_period_end and sla.last_period_end >= latest_closed_end:
                    period_end = current_period_end
                else:
                    period_end = latest_closed_end

                due = VendorSLAHistoryService.due_date(period_end)
                vendor_id = vendor.id

                locale = getattr(reporting_owner, "preferred_language", None) or "en"
                due_str = due.isoformat()

                # Due soon / tomorrow / overdue
                if due == today + timedelta(days=1):
                    if not await VendorSLADeadlineService._check_duplicate_notification(
                        db,
                        vendor_id=vendor_id,
                        notification_type=NotificationType.VENDOR_SLA_DUE_TOMORROW,
                        lookback_days=config["duplicate_lookback_days"],
                        now=now,
                    ):
                        created = await NotificationService.create_vendor_notification_if_visible(
                            db=db,
                            user=reporting_owner,
                            vendor_id=vendor_id,
                            notification_type=NotificationType.VENDOR_SLA_DUE_TOMORROW,
                            title=t("notifications.vendor_sla_due_tomorrow_title", locale=locale),
                            message=t(
                                "notifications.vendor_sla_due_tomorrow_message",
                                locale=locale,
                                vendor_name=vendor.name,
                                sla_name=sla.metric_name,
                                due_date=due_str,
                            ),
                            created_at=now,
                            visibility_cache=visibility_cache,
                        )
                        if created:
                            results["due_tomorrow"] += 1
                            results["notifications_created"] += 1

                if today <= due <= (today + timedelta(days=7)):
                    if not await VendorSLADeadlineService._check_duplicate_notification(
                        db,
                        vendor_id=vendor_id,
                        notification_type=NotificationType.VENDOR_SLA_DUE_SOON,
                        lookback_days=config["duplicate_lookback_days"],
                        now=now,
                    ):
                        created = await NotificationService.create_vendor_notification_if_visible(
                            db=db,
                            user=reporting_owner,
                            vendor_id=vendor_id,
                            notification_type=NotificationType.VENDOR_SLA_DUE_SOON,
                            title=t("notifications.vendor_sla_due_soon_title", locale=locale),
                            message=t(
                                "notifications.vendor_sla_due_soon_message",
                                locale=locale,
                                vendor_name=vendor.name,
                                sla_name=sla.metric_name,
                                due_date=due_str,
                            ),
                            created_at=now,
                            visibility_cache=visibility_cache,
                        )
                        if created:
                            results["due_soon"] += 1
                            results["notifications_created"] += 1

                if due < today:
                    if not await VendorSLADeadlineService._check_duplicate_notification(
                        db,
                        vendor_id=vendor_id,
                        notification_type=NotificationType.VENDOR_SLA_OVERDUE,
                        lookback_days=config["duplicate_lookback_days"],
                        now=now,
                    ):
                        created = await NotificationService.create_vendor_notification_if_visible(
                            db=db,
                            user=reporting_owner,
                            vendor_id=vendor_id,
                            notification_type=NotificationType.VENDOR_SLA_OVERDUE,
                            title=t("notifications.vendor_sla_overdue_title", locale=locale),
                            message=t(
                                "notifications.vendor_sla_overdue_message",
                                locale=locale,
                                vendor_name=vendor.name,
                                sla_name=sla.metric_name,
                                due_date=due_str,
                            ),
                            created_at=now,
                            visibility_cache=visibility_cache,
                        )
                        if created:
                            results["overdue"] += 1
                            results["notifications_created"] += 1

                # Breach / near breach
                breach_status = sla.breach_status
                if breach_status in ("above", "below"):
                    if not await VendorSLADeadlineService._check_duplicate_notification(
                        db,
                        vendor_id=vendor_id,
                        notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
                        lookback_days=config["duplicate_lookback_days"],
                        now=now,
                    ):
                        # Reporting owner
                        await NotificationService.create_vendor_notification_if_visible(
                            db=db,
                            user=reporting_owner,
                            vendor_id=vendor_id,
                            notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
                            title=t("notifications.vendor_sla_breach_detected_title", locale=locale),
                            message=t(
                                "notifications.vendor_sla_breach_detected_message",
                                locale=locale,
                                vendor_name=vendor.name,
                                sla_name=sla.metric_name,
                            ),
                            created_at=now,
                            visibility_cache=visibility_cache,
                        )

                        # Outsourcing owner (visibility)
                        if vendor.outsourcing_owner_user_id and vendor.outsourcing_owner_user_id != reporting_owner.id:
                            owner = owners_by_id.get(vendor.outsourcing_owner_user_id)
                            if owner:
                                owner_locale = getattr(owner, "preferred_language", None) or "en"
                                await NotificationService.create_vendor_notification_if_visible(
                                    db=db,
                                    user=owner,
                                    vendor_id=vendor_id,
                                    notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
                                    title=t("notifications.vendor_sla_breach_detected_title", locale=owner_locale),
                                    message=t(
                                        "notifications.vendor_sla_breach_detected_message",
                                        locale=owner_locale,
                                        vendor_name=vendor.name,
                                        sla_name=sla.metric_name,
                                    ),
                                    created_at=now,
                                    visibility_cache=visibility_cache,
                                )

                        # Risk Manager / Compliance fan-out
                        for gov in governance_recipients:
                            if gov.id in {reporting_owner.id, vendor.outsourcing_owner_user_id}:
                                continue
                            gov_locale = getattr(gov, "preferred_language", None) or "en"
                            await NotificationService.create_vendor_notification_if_visible(
                                db=db,
                                user=gov,
                                vendor_id=vendor_id,
                                notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
                                title=t("notifications.vendor_sla_breach_detected_title", locale=gov_locale),
                                message=t(
                                    "notifications.vendor_sla_breach_detected_message",
                                    locale=gov_locale,
                                    vendor_name=vendor.name,
                                    sla_name=sla.metric_name,
                                ),
                                created_at=now,
                                visibility_cache=visibility_cache,
                            )

                        results["breached"] += 1

                else:
                    range_size = sla.upper_limit - sla.lower_limit
                    if range_size > 0:
                        threshold_value = sla.lower_limit + (range_size * config["near_breach_threshold"])
                        if sla.current_value >= threshold_value:
                            if not await VendorSLADeadlineService._check_duplicate_notification(
                                db,
                                vendor_id=vendor_id,
                                notification_type=NotificationType.VENDOR_SLA_NEAR_BREACH,
                                lookback_days=config["duplicate_lookback_days"],
                                now=now,
                            ):
                                created = await NotificationService.create_vendor_notification_if_visible(
                                    db=db,
                                    user=reporting_owner,
                                    vendor_id=vendor_id,
                                    notification_type=NotificationType.VENDOR_SLA_NEAR_BREACH,
                                    title=t("notifications.vendor_sla_near_breach_title", locale=locale),
                                    message=t(
                                        "notifications.vendor_sla_near_breach_message",
                                        locale=locale,
                                        vendor_name=vendor.name,
                                        sla_name=sla.metric_name,
                                    ),
                                    created_at=now,
                                    visibility_cache=visibility_cache,
                                )
                                if created:
                                    results["near_breach"] += 1
                                    results["notifications_created"] += 1

            except Exception as e:
                logger.error(f"Error checking vendor SLA {getattr(sla, 'id', None)}: {e}")
                continue

        await db.commit()
        return results
