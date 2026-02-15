from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission
from app.models import User, Vendor
from app.models.role import Role, RolePermission, RoleType


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int, current_user: User) -> Vendor:
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


def _require_vendor_write(vendor: Vendor, current_user: User) -> None:
    can_write = check_permission(current_user, "vendors", "write")
    if can_write:
        return
    if is_vendor_owner(vendor, current_user):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")


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

