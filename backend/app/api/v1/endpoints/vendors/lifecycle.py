from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.mappers.vendor import vendor_to_read
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.vendor import VendorRead, VendorStatusEnum

from ._shared import _get_vendor_with_deps

router = APIRouter()


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "delete"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:delete")

    vendor = await _get_vendor_with_deps(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    changes = build_change_set(vendor, {"status": "inactive"})
    vendor.status = "inactive"
    await db.commit()
    await db.refresh(vendor)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.ARCHIVE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Archived vendor {vendor.name}",
    )
    await db.commit()
    return None


@router.post("/{vendor_id}/restore", response_model=VendorRead)
async def restore_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "delete"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:delete")

    vendor = await _get_vendor_with_deps(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    if vendor.status != VendorStatusEnum.inactive.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor is not archived")

    changes = build_change_set(vendor, {"status": VendorStatusEnum.active.value})
    vendor.status = VendorStatusEnum.active.value
    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Restored vendor {vendor.name}",
    )
    await db.commit()
    await db.refresh(vendor)

    vendor = await _get_vendor_with_deps(db, vendor.id)
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor_to_read(vendor)

