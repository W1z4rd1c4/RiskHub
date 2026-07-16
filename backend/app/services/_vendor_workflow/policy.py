from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    check_department_access,
    get_user_department_ids,
)
from app.core.security import check_permission
from app.models import Department, User, Vendor
from app.services._vendor_owner_lock import acquire_vendor_owner_identity_lock


def apply_vendor_visibility_scope(query, current_user: User, *, department_id: int | None = None):
    """Apply list/read prefiltering for vendor collections."""
    if not check_permission(current_user, "vendors", "read"):
        query = query.where(Vendor.outsourcing_owner_user_id == current_user.id)
        if department_id is not None:
            query = query.where(Vendor.department_id == department_id)
        return query

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        if department_id is not None:
            return query.where(Vendor.department_id == department_id)
        return query

    if department_id is not None:
        if department_id not in dept_ids:
            return query.where(false())
        return query.where(Vendor.department_id == department_id)

    if dept_ids:
        return query.where(
            or_(
                Vendor.department_id.in_(dept_ids),
                Vendor.outsourcing_owner_user_id == current_user.id,
            ),
            Vendor.department_id.is_not(None),
        )
    return query.where(Vendor.outsourcing_owner_user_id == current_user.id, Vendor.department_id.is_not(None))


def apply_vendor_report_scope(query, current_user: User, *, department_id: int | None = None):
    """Vendor reports include actor-visible vendors; explicit department filters stay strict."""
    return apply_vendor_visibility_scope(query, current_user, department_id=department_id)


async def load_vendor_for_update(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(
        select(Vendor)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(Vendor.id == vendor_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def validate_vendor_governance_assignment(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
    owner_user_id: int,
    acquire_identity_lock: bool = True,
) -> None:
    check_department_access(department_id, current_user)

    if acquire_identity_lock:
        await acquire_vendor_owner_identity_lock(db, user_id=owner_user_id)

    owner = await db.get(User, owner_user_id)
    if owner is None or not owner.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor owner must be an active user")

    if department_id is not None:
        department = await db.get(Department, department_id)
        if department is None or not department.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor department must be active")
