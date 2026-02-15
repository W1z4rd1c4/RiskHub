from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.vendor_remediation import VendorRemediationAction, VendorRemediationStatus
from app.schemas.vendor_incident import VendorRemediationCreate, VendorRemediationRead, VendorRemediationUpdate

from ._shared import _get_vendor_or_404, _require_vendor_write

router = APIRouter()


@router.get("/vendors/{vendor_id}/remediation", response_model=list[VendorRemediationRead])
async def list_vendor_remediation(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    await _get_vendor_or_404(db, vendor_id, current_user)
    result = await db.execute(
        select(VendorRemediationAction)
        .where(VendorRemediationAction.vendor_id == vendor_id)
        .order_by(desc(VendorRemediationAction.due_at), desc(VendorRemediationAction.created_at))
    )
    return result.scalars().all()


@router.post(
    "/vendors/{vendor_id}/remediation", response_model=VendorRemediationRead, status_code=status.HTTP_201_CREATED
)
async def create_vendor_remediation(
    vendor_id: int,
    payload: VendorRemediationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    remediation = VendorRemediationAction(
        vendor_id=vendor_id,
        incident_id=payload.incident_id,
        owner_user_id=payload.owner_user_id,
        status=VendorRemediationStatus(payload.status.value),
        due_at=payload.due_at,
        description=payload.description,
    )
    db.add(remediation)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_REMEDIATION,
        entity_id=remediation.id,
        entity_name=f"{vendor.name} remediation",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=vendor.department_id,
        description=f"Created vendor remediation action for {vendor.name}",
    )

    await db.commit()
    await db.refresh(remediation)
    return remediation


@router.patch("/vendor-remediation/{remediation_id}", response_model=VendorRemediationRead)
async def update_vendor_remediation(
    remediation_id: int,
    payload: VendorRemediationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    remediation_stmt = select(VendorRemediationAction).where(VendorRemediationAction.id == remediation_id)
    remediation = (await db.execute(remediation_stmt)).scalar_one_or_none()
    if not remediation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Remediation not found")

    vendor = await _get_vendor_or_404(db, remediation.vendor_id, current_user)
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and remediation.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    changes = build_change_set(remediation, updates)
    for field, value in updates.items():
        if field == "status" and value is not None:
            remediation.status = VendorRemediationStatus(value.value)
        else:
            setattr(remediation, field, value)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_REMEDIATION,
        entity_id=remediation.id,
        entity_name=f"{vendor.name} remediation",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
    )

    await db.commit()
    await db.refresh(remediation)
    return remediation


@router.delete("/vendor-remediation/{remediation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_remediation(
    remediation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    remediation_stmt = select(VendorRemediationAction).where(VendorRemediationAction.id == remediation_id)
    remediation = (await db.execute(remediation_stmt)).scalar_one_or_none()
    if not remediation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Remediation not found")

    vendor = await _get_vendor_or_404(db, remediation.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(remediation)
    await db.commit()
    return None
