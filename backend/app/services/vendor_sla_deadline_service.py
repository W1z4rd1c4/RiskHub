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
    def _resolve_reporting_owner(sla: VendorSLA, owners_by_id: dict[int, User]) -> User | None:
        reporting_owner = owners_by_id.get(sla.reporting_owner_id) if sla.reporting_owner_id else None
        if not reporting_owner and sla.vendor and sla.vendor.outsourcing_owner_user_id:
            reporting_owner = owners_by_id.get(sla.vendor.outsourcing_owner_user_id)
        return reporting_owner

    @staticmethod
    def _resolve_period_end(sla: VendorSLA, today: date) -> date:
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, sla.frequency)
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, sla.frequency)
        if sla.last_period_end and sla.last_period_end >= latest_closed_end:
            return current_period_end
        return latest_closed_end

    @staticmethod
    async def _create_due_notification(
        db: AsyncSession,
        *,
        reporting_owner: User,
        vendor_id: int,
        notification_type: NotificationType,
        title_key: str,
        message_key: str,
        vendor_name: str,
        sla_name: str,
        due_str: str,
        lookback_days: int,
        now: datetime,
        visibility_cache: dict[tuple[int, int], bool],
    ) -> bool:
        if await VendorSLADeadlineService._check_duplicate_notification(
            db,
            vendor_id=vendor_id,
            notification_type=notification_type,
            lookback_days=lookback_days,
            now=now,
        ):
            return False

        locale = getattr(reporting_owner, "preferred_language", None) or "en"
        return await NotificationService.create_vendor_notification_if_visible(
            db=db,
            user=reporting_owner,
            vendor_id=vendor_id,
            notification_type=notification_type,
            title=t(title_key, locale=locale),
            message=t(
                message_key,
                locale=locale,
                vendor_name=vendor_name,
                sla_name=sla_name,
                due_date=due_str,
            ),
            created_at=now,
            visibility_cache=visibility_cache,
        )

    @staticmethod
    async def _process_due_notifications(
        db: AsyncSession,
        *,
        sla: VendorSLA,
        reporting_owner: User,
        vendor_id: int,
        due: date,
        today: date,
        due_str: str,
        config: dict,
        now: datetime,
        visibility_cache: dict[tuple[int, int], bool],
        results: dict[str, int],
    ) -> None:
        if due == today + timedelta(days=1):
            created = await VendorSLADeadlineService._create_due_notification(
                db,
                reporting_owner=reporting_owner,
                vendor_id=vendor_id,
                notification_type=NotificationType.VENDOR_SLA_DUE_TOMORROW,
                title_key="notifications.vendor_sla_due_tomorrow_title",
                message_key="notifications.vendor_sla_due_tomorrow_message",
                vendor_name=sla.vendor.name,
                sla_name=sla.metric_name,
                due_str=due_str,
                lookback_days=config["duplicate_lookback_days"],
                now=now,
                visibility_cache=visibility_cache,
            )
            if created:
                results["due_tomorrow"] += 1
                results["notifications_created"] += 1

        if today <= due <= (today + timedelta(days=7)):
            created = await VendorSLADeadlineService._create_due_notification(
                db,
                reporting_owner=reporting_owner,
                vendor_id=vendor_id,
                notification_type=NotificationType.VENDOR_SLA_DUE_SOON,
                title_key="notifications.vendor_sla_due_soon_title",
                message_key="notifications.vendor_sla_due_soon_message",
                vendor_name=sla.vendor.name,
                sla_name=sla.metric_name,
                due_str=due_str,
                lookback_days=config["duplicate_lookback_days"],
                now=now,
                visibility_cache=visibility_cache,
            )
            if created:
                results["due_soon"] += 1
                results["notifications_created"] += 1

        if due < today:
            created = await VendorSLADeadlineService._create_due_notification(
                db,
                reporting_owner=reporting_owner,
                vendor_id=vendor_id,
                notification_type=NotificationType.VENDOR_SLA_OVERDUE,
                title_key="notifications.vendor_sla_overdue_title",
                message_key="notifications.vendor_sla_overdue_message",
                vendor_name=sla.vendor.name,
                sla_name=sla.metric_name,
                due_str=due_str,
                lookback_days=config["duplicate_lookback_days"],
                now=now,
                visibility_cache=visibility_cache,
            )
            if created:
                results["overdue"] += 1
                results["notifications_created"] += 1

    @staticmethod
    async def _process_detected_breach(
        db: AsyncSession,
        *,
        sla: VendorSLA,
        reporting_owner: User,
        governance_recipients: list[User],
        owners_by_id: dict[int, User],
        vendor_id: int,
        lookback_days: int,
        now: datetime,
        visibility_cache: dict[tuple[int, int], bool],
        results: dict[str, int],
    ) -> bool:
        vendor = sla.vendor
        if not vendor or sla.breach_status not in ("above", "below"):
            return False

        if await VendorSLADeadlineService._check_duplicate_notification(
            db,
            vendor_id=vendor_id,
            notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
            lookback_days=lookback_days,
            now=now,
        ):
            return True

        recipients: list[User] = [reporting_owner]
        owner_id = vendor.outsourcing_owner_user_id
        if owner_id and owner_id != reporting_owner.id:
            owner = owners_by_id.get(owner_id)
            if owner:
                recipients.append(owner)

        skip_ids = {reporting_owner.id, owner_id}
        recipients.extend(gov for gov in governance_recipients if gov.id not in skip_ids)

        for recipient in recipients:
            locale = getattr(recipient, "preferred_language", None) or "en"
            await NotificationService.create_vendor_notification_if_visible(
                db=db,
                user=recipient,
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

        results["breached"] += 1
        return True

    @staticmethod
    async def _process_near_breach(
        db: AsyncSession,
        *,
        sla: VendorSLA,
        reporting_owner: User,
        vendor_id: int,
        near_breach_threshold: float,
        duplicate_lookback_days: int,
        now: datetime,
        visibility_cache: dict[tuple[int, int], bool],
        results: dict[str, int],
    ) -> None:
        vendor = sla.vendor
        if not vendor:
            return

        range_size = sla.upper_limit - sla.lower_limit
        if range_size <= 0:
            return

        threshold_value = sla.lower_limit + (range_size * near_breach_threshold)
        if sla.current_value < threshold_value:
            return

        if await VendorSLADeadlineService._check_duplicate_notification(
            db,
            vendor_id=vendor_id,
            notification_type=NotificationType.VENDOR_SLA_NEAR_BREACH,
            lookback_days=duplicate_lookback_days,
            now=now,
        ):
            return

        locale = getattr(reporting_owner, "preferred_language", None) or "en"
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

    @staticmethod
    async def _process_breach_notifications(
        db: AsyncSession,
        *,
        sla: VendorSLA,
        reporting_owner: User,
        governance_recipients: list[User],
        owners_by_id: dict[int, User],
        vendor_id: int,
        config: dict,
        now: datetime,
        visibility_cache: dict[tuple[int, int], bool],
        results: dict[str, int],
    ) -> None:
        detected_breach_processed = await VendorSLADeadlineService._process_detected_breach(
            db,
            sla=sla,
            reporting_owner=reporting_owner,
            governance_recipients=governance_recipients,
            owners_by_id=owners_by_id,
            vendor_id=vendor_id,
            lookback_days=config["duplicate_lookback_days"],
            now=now,
            visibility_cache=visibility_cache,
            results=results,
        )
        if detected_breach_processed:
            return

        await VendorSLADeadlineService._process_near_breach(
            db,
            sla=sla,
            reporting_owner=reporting_owner,
            vendor_id=vendor_id,
            near_breach_threshold=config["near_breach_threshold"],
            duplicate_lookback_days=config["duplicate_lookback_days"],
            now=now,
            visibility_cache=visibility_cache,
            results=results,
        )

    @staticmethod
    async def _process_single_sla(
        db: AsyncSession,
        *,
        sla: VendorSLA,
        today: date,
        now: datetime,
        config: dict,
        governance_recipients: list[User],
        owners_by_id: dict[int, User],
        visibility_cache: dict[tuple[int, int], bool],
        results: dict[str, int],
    ) -> None:
        vendor = sla.vendor
        if not vendor:
            return

        reporting_owner = VendorSLADeadlineService._resolve_reporting_owner(sla, owners_by_id)
        if not reporting_owner:
            return

        period_end = VendorSLADeadlineService._resolve_period_end(sla, today)
        due = VendorSLAHistoryService.due_date(period_end)
        due_str = due.isoformat()
        vendor_id = vendor.id

        await VendorSLADeadlineService._process_due_notifications(
            db,
            sla=sla,
            reporting_owner=reporting_owner,
            vendor_id=vendor_id,
            due=due,
            today=today,
            due_str=due_str,
            config=config,
            now=now,
            visibility_cache=visibility_cache,
            results=results,
        )
        await VendorSLADeadlineService._process_breach_notifications(
            db,
            sla=sla,
            reporting_owner=reporting_owner,
            governance_recipients=governance_recipients,
            owners_by_id=owners_by_id,
            vendor_id=vendor_id,
            config=config,
            now=now,
            visibility_cache=visibility_cache,
            results=results,
        )

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
            .where(VendorSLA.is_archived.is_(False))
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
            permission_load = (
                selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
            )
            owners = (
                (await db.execute(select(User).options(permission_load).where(User.id.in_(owner_ids)))).scalars().all()
            )
            owners_by_id = {owner.id: owner for owner in owners}

        for sla in slas:
            try:
                await VendorSLADeadlineService._process_single_sla(
                    db,
                    sla=sla,
                    today=today,
                    now=now,
                    config=config,
                    governance_recipients=governance_recipients,
                    owners_by_id=owners_by_id,
                    visibility_cache=visibility_cache,
                    results=results,
                )
            except Exception as e:
                logger.error(f"Error checking vendor SLA {getattr(sla, 'id', None)}: {e}")
                continue

        await db.commit()
        return results
