from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.audit import vendor as audit_vendor
from app.core.exceptions import NotFoundError
from app.models import User, Vendor
from app.schemas.vendor import VendorCreate, VendorRead, VendorUpdate

from .policy import (
    assert_vendor_archive_allowed,
    assert_vendor_create_allowed,
    assert_vendor_governance_update_allowed,
    assert_vendor_readable,
    assert_vendor_restore_allowed,
    assert_vendor_update_allowed,
    load_vendor_with_deps,
)
from .projection import serialize_vendor_detail


async def create_vendor_detail(
    *,
    db: AsyncSession,
    payload: VendorCreate,
    current_user: User,
) -> VendorRead:
    await assert_vendor_create_allowed(
        db,
        current_user=current_user,
        department_id=payload.department_id,
        owner_user_id=payload.outsourcing_owner_user_id,
    )

    vendor = Vendor(**payload.model_dump())
    db.add(vendor)
    await db.flush()

    await audit_vendor.vendor_created(
        db,
        actor=current_user,
        vendor=vendor,
        log_activity_func=log_activity,
    )
    await db.commit()
    await db.refresh(vendor)

    refreshed = await load_vendor_with_deps(db, vendor.id)
    if not refreshed:
        raise NotFoundError("Vendor not found")
    return serialize_vendor_detail(refreshed, current_user=current_user)


async def read_vendor_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    current_user: User,
) -> VendorRead:
    vendor = await assert_vendor_readable(db, vendor_id=vendor_id, current_user=current_user)
    return serialize_vendor_detail(vendor, current_user=current_user)


async def update_vendor_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    payload: VendorUpdate,
    current_user: User,
) -> VendorRead:
    vendor = await assert_vendor_update_allowed(db, vendor_id=vendor_id, current_user=current_user)
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    if not updates:
        return serialize_vendor_detail(vendor, current_user=current_user)

    await assert_vendor_governance_update_allowed(db, current_user=current_user, vendor=vendor, updates=updates)
    changes = audit_vendor.vendor_update_changes(vendor, updates)
    for field, value in updates.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(vendor, field, value)

    await audit_vendor.vendor_updated(
        db,
        actor=current_user,
        vendor=vendor,
        changes=changes,
        log_activity_func=log_activity,
    )
    await db.commit()
    await db.refresh(vendor)

    refreshed = await load_vendor_with_deps(db, vendor.id)
    if not refreshed:
        raise NotFoundError("Vendor not found")
    return serialize_vendor_detail(refreshed, current_user=current_user)


async def archive_vendor_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    current_user: User,
) -> None:
    vendor = await assert_vendor_archive_allowed(db, vendor_id=vendor_id, current_user=current_user)
    changes = audit_vendor.vendor_archive_changes(vendor)
    vendor.mark_archived(current_user)

    await audit_vendor.vendor_archived(
        db,
        actor=current_user,
        vendor=vendor,
        changes=changes,
        log_activity_func=log_activity,
    )
    await db.commit()


async def restore_vendor_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    current_user: User,
) -> VendorRead:
    vendor = await assert_vendor_restore_allowed(db, vendor_id=vendor_id, current_user=current_user)
    changes = audit_vendor.vendor_restore_changes(vendor)
    vendor.mark_restored(current_user)
    await audit_vendor.vendor_restored(
        db,
        actor=current_user,
        vendor=vendor,
        changes=changes,
        log_activity_func=log_activity,
    )
    await db.commit()
    await db.refresh(vendor)

    refreshed = await load_vendor_with_deps(db, vendor.id)
    if not refreshed:
        raise NotFoundError("Vendor not found")
    return serialize_vendor_detail(refreshed, current_user=current_user)
