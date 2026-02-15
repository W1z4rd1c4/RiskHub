from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.models import User
from app.models.notification import Notification, NotificationType
from app.models.role import Role, RolePermission, RoleType
from app.models.vendor_sla import VendorSLA


def _breach_status(current_value: float, lower: float, upper: float) -> str:
    if current_value < lower:
        return "below"
    if current_value > upper:
        return "above"
    return "within"


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


async def _check_duplicate_notification(
    db: AsyncSession,
    *,
    vendor_id: int,
    notification_type: NotificationType,
    now: datetime,
    lookback_days: int = 7,
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


async def _get_sla_or_404(db: AsyncSession, sla_id: int) -> VendorSLA:
    result = await db.execute(
        select(VendorSLA)
        .options(selectinload(VendorSLA.vendor), selectinload(VendorSLA.reporting_owner))
        .where(VendorSLA.id == sla_id)
    )
    sla = result.scalar_one_or_none()
    if not sla:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    return sla


def _can_read_sla(sla: VendorSLA, current_user: User) -> bool:
    if sla.reporting_owner_id and sla.reporting_owner_id == current_user.id:
        return True
    if sla.vendor and can_read_vendor(sla.vendor, current_user):
        return True
    return False


def _can_write_sla(sla: VendorSLA, current_user: User) -> bool:
    if check_permission(current_user, "vendors", "write"):
        return True
    if sla.reporting_owner_id and sla.reporting_owner_id == current_user.id:
        return True
    if sla.vendor and sla.vendor.outsourcing_owner_user_id == current_user.id:
        return True
    return False


def _is_due_soon(*, due: date, today: date) -> bool:
    return today <= due <= (today + timedelta(days=7))

