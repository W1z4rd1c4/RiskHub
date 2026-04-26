from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    can_read_vendor,
    check_department_access,
    get_user_department_ids,
    has_permission,
    is_vendor_owner,
)
from app.models import Department, User, Vendor
from app.models.user import AccessScope


def _is_global_user(user: User) -> bool:
    return getattr(user, "access_scope", None) == AccessScope.GLOBAL


def apply_vendor_visibility_scope(query, current_user: User, *, department_id: int | None = None):
    """Apply list/read prefiltering for vendor collections."""
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
    """Vendor reports use strict department scoping and do not include owner exceptions."""
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        if department_id is not None:
            return query.where(Vendor.department_id == department_id)
        return query

    if department_id is not None:
        if department_id not in dept_ids:
            return query.where(false())
        return query.where(Vendor.department_id == department_id)

    if not dept_ids:
        return query.where(false())
    return query.where(Vendor.department_id.in_(dept_ids))


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
) -> None:
    check_department_access(department_id, current_user)

    owner = await db.get(User, owner_user_id)
    if owner is None or not owner.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor owner must be an active user")

    if department_id is not None:
        department = await db.get(Department, department_id)
        if department is None or not department.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor department must be active")

    if owner.department_id is not None and department_id != owner.department_id and not _is_global_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vendor owner must belong to the selected department",
        )


def vendor_capabilities(current_user: User, vendor: Vendor) -> dict[str, bool]:
    can_write = has_permission(current_user, "vendors", "write")
    can_delete = has_permission(current_user, "vendors", "delete")
    can_update = can_write or is_vendor_owner(vendor, current_user)
    is_visible = can_read_vendor(vendor, current_user)
    can_archive = bool(is_visible and can_delete and vendor.status == "active")
    can_restore = bool(is_visible and can_delete and vendor.status == "inactive")
    can_mutate_links = bool(is_visible and can_update)
    return {
        "can_read": bool(is_visible),
        "can_update": bool(is_visible and can_update),
        "can_archive": can_archive,
        "can_restore": can_restore,
        "can_create_linked_risk": bool(can_mutate_links and has_permission(current_user, "risks", "write")),
        "can_create_linked_control": bool(can_mutate_links and has_permission(current_user, "controls", "write")),
        "can_create_linked_kri": bool(can_mutate_links and has_permission(current_user, "risks", "write")),
        "can_link_risk": bool(can_mutate_links and has_permission(current_user, "risks", "read")),
        "can_link_control": bool(can_mutate_links and has_permission(current_user, "controls", "read")),
        "can_link_kri": bool(can_mutate_links and has_permission(current_user, "risks", "read")),
        "can_view_linked_risks": bool(is_visible and has_permission(current_user, "risks", "read")),
        "can_view_linked_controls": bool(is_visible and has_permission(current_user, "controls", "read")),
        "can_view_linked_kris": bool(is_visible and has_permission(current_user, "risks", "read")),
        "can_create_issue": bool(is_visible and has_permission(current_user, "issues", "write")),
    }
