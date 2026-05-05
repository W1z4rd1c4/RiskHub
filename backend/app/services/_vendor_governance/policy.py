from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission
from app.models import User, Vendor
from app.schemas.vendor import VendorStatusEnum
from app.services._vendor_workflow import load_vendor_for_update, validate_vendor_governance_assignment


async def load_vendor_with_deps(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(
        select(Vendor)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(Vendor.id == vendor_id)
    )
    return result.scalar_one_or_none()


async def assert_vendor_readable(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    vendor = await load_vendor_with_deps(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


async def assert_vendor_update_allowed(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> Vendor:
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await load_vendor_for_update(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    if vendor.status == VendorStatusEnum.inactive.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot update inactive vendor")

    if not check_permission(current_user, "vendors", "write") and not is_vendor_owner(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")
    return vendor


async def assert_vendor_governance_update_allowed(
    db: AsyncSession,
    *,
    current_user: User,
    vendor: Vendor,
    updates: dict,
) -> None:
    can_write = check_permission(current_user, "vendors", "write")
    restricted_fields = {"department_id", "outsourcing_owner_user_id", "status"}
    if not can_write and (restricted_fields & set(updates.keys())):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to change governance fields",
        )

    next_department_id = updates.get("department_id", vendor.department_id)
    next_owner_user_id = updates.get("outsourcing_owner_user_id", vendor.outsourcing_owner_user_id)
    if can_write and ({"department_id", "outsourcing_owner_user_id"} & set(updates.keys())):
        await validate_vendor_governance_assignment(
            db,
            current_user=current_user,
            department_id=next_department_id,
            owner_user_id=next_owner_user_id,
        )


async def assert_vendor_create_allowed(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
    owner_user_id: int,
) -> None:
    await validate_vendor_governance_assignment(
        db,
        current_user=current_user,
        department_id=department_id,
        owner_user_id=owner_user_id,
    )


async def assert_vendor_delete_allowed(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    if not check_permission(current_user, "vendors", "delete"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:delete")

    vendor = await load_vendor_for_update(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


async def assert_vendor_archive_allowed(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    vendor = await assert_vendor_delete_allowed(db, vendor_id=vendor_id, current_user=current_user)
    if vendor.status == VendorStatusEnum.inactive.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor is already archived")
    return vendor


async def assert_vendor_restore_allowed(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    vendor = await assert_vendor_delete_allowed(db, vendor_id=vendor_id, current_user=current_user)
    if vendor.status != VendorStatusEnum.inactive.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor is not archived")
    return vendor
