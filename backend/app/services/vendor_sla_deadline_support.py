"""Support helpers for vendor SLA deadline evaluation context."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import User
from app.models.global_config import ConfigDefaults, get_config_float, get_config_int
from app.models.notification import Notification, NotificationType
from app.models.role import Role, RolePermission, RoleType
from app.models.vendor_sla import VendorSLA
from app.services.kri_history_service import KRIHistoryService
from app.services.vendor_sla_history_service import VendorSLAHistoryService


@dataclass(frozen=True, slots=True)
class VendorSLADeadlineContext:
    due: date
    due_str: str
    reporting_owner: User
    vendor_id: int
    vendor_name: str
    outsourcing_owner_id: int | None


def initialize_results() -> dict[str, int]:
    return {
        "due_soon": 0,
        "due_tomorrow": 0,
        "overdue": 0,
        "near_breach": 0,
        "breached": 0,
        "total_checked": 0,
        "notifications_created": 0,
    }


async def load_vendor_sla_config(db: AsyncSession) -> dict[str, float | int]:
    return {
        "near_breach_threshold": await get_config_float(
            db, "near_breach_threshold", ConfigDefaults.NEAR_BREACH_THRESHOLD
        ),
        "duplicate_lookback_days": await get_config_int(
            db, "duplicate_lookback_days", ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
        ),
    }


async def list_active_slas(db: AsyncSession) -> list[VendorSLA]:
    stmt = (
        select(VendorSLA)
        .where(VendorSLA.is_archived.is_(False))
        .options(selectinload(VendorSLA.vendor), selectinload(VendorSLA.reporting_owner))
    )
    return (await db.execute(stmt)).scalars().all()


def collect_owner_ids(slas: list[VendorSLA]) -> set[int]:
    owner_ids: set[int] = set()
    for sla in slas:
        if sla.reporting_owner_id:
            owner_ids.add(sla.reporting_owner_id)
        if sla.vendor and sla.vendor.outsourcing_owner_user_id:
            owner_ids.add(sla.vendor.outsourcing_owner_user_id)
    return owner_ids


async def load_owners_by_id(db: AsyncSession, owner_ids: set[int]) -> dict[int, User]:
    if not owner_ids:
        return {}

    permission_load = (
        selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    )
    owners = (
        (await db.execute(select(User).options(permission_load).where(User.id.in_(owner_ids)))).scalars().all()
    )
    return {owner.id: owner for owner in owners}


async def list_governance_recipients(db: AsyncSession, roles: set[RoleType]) -> list[User]:
    role_names = [role.value for role in roles]
    permission_load = (
        selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    )
    stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .options(permission_load)
        .where(User.is_active.is_(True))
        .where(Role.name.in_(role_names))
    )
    return (await db.execute(stmt)).scalars().all()


async def check_duplicate_vendor_notification(
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
    return (await db.execute(stmt)).scalar_one_or_none() is not None


def resolve_reporting_owner(sla: VendorSLA, owners_by_id: dict[int, User]) -> User | None:
    reporting_owner = owners_by_id.get(sla.reporting_owner_id) if sla.reporting_owner_id else None
    if not reporting_owner and sla.vendor and sla.vendor.outsourcing_owner_user_id:
        reporting_owner = owners_by_id.get(sla.vendor.outsourcing_owner_user_id)
    return reporting_owner


def resolve_period_end(sla: VendorSLA, today: date) -> date:
    _, current_period_end = KRIHistoryService.period_bounds_for_date(today, sla.frequency)
    _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, sla.frequency)
    if sla.last_period_end and sla.last_period_end >= latest_closed_end:
        return current_period_end
    return latest_closed_end


def build_vendor_sla_deadline_context(
    sla: VendorSLA,
    *,
    today: date,
    owners_by_id: dict[int, User],
) -> VendorSLADeadlineContext | None:
    vendor = sla.vendor
    if not vendor:
        return None

    reporting_owner = resolve_reporting_owner(sla, owners_by_id)
    if not reporting_owner:
        return None

    period_end = resolve_period_end(sla, today)
    due = VendorSLAHistoryService.due_date(period_end)
    return VendorSLADeadlineContext(
        due=due,
        due_str=due.isoformat(),
        reporting_owner=reporting_owner,
        vendor_id=vendor.id,
        vendor_name=vendor.name,
        outsourcing_owner_id=vendor.outsourcing_owner_user_id,
    )
