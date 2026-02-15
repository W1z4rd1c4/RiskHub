from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.mappers.vendor import vendor_to_read
from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.vendor import VendorRead

from ._shared import VendorTriggerReassessmentPayload, _get_vendor_with_deps

router = APIRouter()


@router.post("/{vendor_id}/trigger-reassessment", response_model=VendorRead)
async def trigger_vendor_reassessment(
    vendor_id: int,
    payload: VendorTriggerReassessmentPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_with_deps(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    is_owner = is_vendor_owner(vendor, current_user)
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    now = utc_now()
    updates = {
        "next_reassessment_due_at": now,
        "reassessment_triggered_reason": payload.reason,
        "reassessment_triggered_at": now,
    }
    changes = build_change_set(vendor, updates)
    vendor.next_reassessment_due_at = now
    vendor.reassessment_triggered_reason = payload.reason
    vendor.reassessment_triggered_at = now

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Triggered vendor reassessment for {vendor.name}",
    )
    await db.commit()
    await db.refresh(vendor)

    vendor = await _get_vendor_with_deps(db, vendor.id)
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor_to_read(vendor)

