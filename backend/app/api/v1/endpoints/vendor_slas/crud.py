from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.mappers.vendor_sla import sla_to_read
from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.db.session import get_db
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.vendor_sla import VendorSLA
from app.schemas.vendor_sla import VendorSLACreate, VendorSLARead, VendorSLAUpdate

from ._shared import _can_read_sla, _can_write_sla, _get_sla_or_404

router = APIRouter()


@router.get("/vendor-slas", response_model=list[VendorSLARead])
async def list_vendor_slas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    vendor_id: int | None = None,
    include_archived: bool = False,
):
    if not check_permission(current_user, "vendors", "read"):
        return []

    stmt = select(VendorSLA).options(selectinload(VendorSLA.vendor), selectinload(VendorSLA.reporting_owner))
    if not include_archived:
        stmt = stmt.where(VendorSLA.is_archived.is_(False))
    if vendor_id is not None:
        stmt = stmt.where(VendorSLA.vendor_id == vendor_id)
    stmt = stmt.order_by(desc(VendorSLA.last_updated))

    slas = (await db.execute(stmt)).scalars().all()
    visible = [s for s in slas if _can_read_sla(s, current_user)]
    return [sla_to_read(s) for s in visible]


@router.post("/vendor-slas", response_model=VendorSLARead, status_code=status.HTTP_201_CREATED)
async def create_vendor_sla(
    payload: VendorSLACreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = (await db.execute(select(Vendor).where(Vendor.id == payload.vendor_id))).scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    can_vendor_write = check_permission(current_user, "vendors", "write")
    is_vendor_owner = vendor.outsourcing_owner_user_id == current_user.id
    is_reporting_owner = payload.reporting_owner_id is not None and payload.reporting_owner_id == current_user.id
    if not (can_vendor_write or is_vendor_owner or is_reporting_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    sla = VendorSLA(
        vendor_id=payload.vendor_id,
        metric_name=payload.metric_name,
        description=payload.description,
        current_value=payload.current_value,
        lower_limit=payload.lower_limit,
        upper_limit=payload.upper_limit,
        unit=payload.unit,
        frequency=payload.frequency.value,
        reporting_owner_id=payload.reporting_owner_id,
    )
    db.add(sla)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_SLA,
        entity_id=sla.id,
        entity_name=f"{vendor.name} SLA",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=vendor.department_id,
        description=f"Created vendor SLA for {vendor.name}",
    )
    await db.commit()
    await db.refresh(sla)
    return sla_to_read(sla)


@router.get("/vendor-slas/{sla_id}", response_model=VendorSLARead)
async def get_vendor_sla(
    sla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    return sla_to_read(sla)


@router.put("/vendor-slas/{sla_id}", response_model=VendorSLARead)
async def update_vendor_sla(
    sla_id: int,
    payload: VendorSLAUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    if not _can_write_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    changes = build_change_set(sla, updates)
    for field, value in updates.items():
        if value is None:
            setattr(sla, field, None)
            continue
        if hasattr(value, "value"):
            value = value.value
        setattr(sla, field, value)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_SLA,
        entity_id=sla.id,
        entity_name=f"{sla.vendor.name} SLA" if sla.vendor else "Vendor SLA",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=sla.vendor.department_id if sla.vendor else None,
        changes=changes,
    )

    await db.commit()
    await db.refresh(sla)
    return sla_to_read(sla)


@router.delete("/vendor-slas/{sla_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_vendor_sla(
    sla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "delete"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:delete")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    if sla.is_archived:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor SLA is already archived")

    changes = build_change_set(sla, {"is_archived": True})
    sla.is_archived = True
    sla.archived_at = utc_now()
    sla.archived_by_id = current_user.id

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_SLA,
        entity_id=sla.id,
        entity_name=f"{sla.vendor.name} SLA" if sla.vendor else "Vendor SLA",
        action=ActivityAction.ARCHIVE,
        actor=current_user,
        department_id=sla.vendor.department_id if sla.vendor else None,
        changes=changes,
        description="Archived vendor SLA",
    )
    await db.commit()
    return None


@router.post("/vendor-slas/{sla_id}/restore", response_model=VendorSLARead)
async def restore_vendor_sla(
    sla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "delete"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:delete")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    if not sla.is_archived:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor SLA is not archived")

    changes = build_change_set(sla, {"is_archived": False, "archived_at": None, "archived_by_id": None})
    sla.is_archived = False
    sla.archived_at = None
    sla.archived_by_id = None

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_SLA,
        entity_id=sla.id,
        entity_name=f"{sla.vendor.name} SLA" if sla.vendor else "Vendor SLA",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=sla.vendor.department_id if sla.vendor else None,
        changes=changes,
        description="Restored vendor SLA",
    )
    await db.commit()
    await db.refresh(sla)
    return sla_to_read(sla)
