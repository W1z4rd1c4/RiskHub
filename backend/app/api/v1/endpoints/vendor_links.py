from __future__ import annotations

from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.v1.endpoints._monitoring_response import (
    load_monitoring_response_context,
    serialize_control_brief_for_link,
)
from app.core.permissions import can_read_control_id, can_read_risk_id, can_read_vendor, is_vendor_owner
from app.core.security import check_permission
from app.core.datetime_utils import utc_now
from app.db.session import get_db
from app.models import (
    Control,
    Risk,
    User,
    Vendor,
    VendorControlLink,
    VendorRiskLink,
)
from app.schemas.vendor_links import LinkedControlRead, LinkedRiskRead, VendorControlLinkCreate, VendorRiskLinkCreate

router = APIRouter()


async def _get_vendor(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


async def _can_read_risk(db: AsyncSession, current_user: User, risk_id: int) -> bool:
    return await can_read_risk_id(db, current_user, risk_id)


async def _can_read_control(db: AsyncSession, current_user: User, control: Control) -> bool:
    return await can_read_control_id(db, current_user, control.id)


@router.get("/vendors/{vendor_id}/linked-risks", response_model=list[LinkedRiskRead])
async def list_vendor_linked_risks(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    vendor = await _get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    result = await db.execute(
        select(VendorRiskLink)
        .options(selectinload(VendorRiskLink.risk).selectinload(Risk.department))
        .where(VendorRiskLink.vendor_id == vendor_id)
    )
    links = result.scalars().all()

    visible: list[LinkedRiskRead] = []
    for link in links:
        if link.risk and await _can_read_risk(db, current_user, link.risk.id):
            risk = link.risk
            visible.append(
                LinkedRiskRead(
                    id=risk.id,
                    risk_id_code=risk.risk_id_code,
                    name=risk.name,
                    process=risk.process,
                    risk_type=risk.risk_type,
                    category=risk.category,
                    gross_score=risk.gross_score,
                    net_score=risk.net_score,
                    is_priority=risk.is_priority,
                    department_id=risk.department_id,
                    department_name=risk.department.name if getattr(risk, "department", None) else None,
                    status=getattr(risk, "status", None),
                )
            )
    return visible


@router.post("/vendors/{vendor_id}/linked-risks", status_code=status.HTTP_201_CREATED)
async def link_vendor_to_risk(
    vendor_id: int,
    payload: VendorRiskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    vendor = await _get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    can_modify_vendor = check_permission(current_user, "vendors", "write") or is_vendor_owner(vendor, current_user)
    if not can_modify_vendor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    result = await db.execute(select(Risk).where(Risk.id == payload.risk_id))
    risk = result.scalar_one_or_none()
    if not risk or not await _can_read_risk(db, current_user, payload.risk_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")

    existing = await db.execute(
        select(VendorRiskLink)
        .where(VendorRiskLink.vendor_id == vendor_id, VendorRiskLink.risk_id == payload.risk_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")

    link = VendorRiskLink(vendor_id=vendor_id, risk_id=payload.risk_id)
    db.add(link)
    await db.commit()
    return {"status": "linked"}


@router.delete("/vendors/{vendor_id}/linked-risks/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_vendor_from_risk(
    vendor_id: int,
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    vendor = await _get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    can_modify_vendor = check_permission(current_user, "vendors", "write") or is_vendor_owner(vendor, current_user)
    if not can_modify_vendor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if not risk or not await _can_read_risk(db, current_user, risk_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")

    result = await db.execute(
        select(VendorRiskLink).where(VendorRiskLink.vendor_id == vendor_id, VendorRiskLink.risk_id == risk_id)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    await db.delete(link)
    await db.commit()
    return None


@router.get("/vendors/{vendor_id}/linked-controls", response_model=list[LinkedControlRead])
async def list_vendor_linked_controls(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    if not check_permission(current_user, "controls", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: controls:read")

    vendor = await _get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    result = await db.execute(
        select(VendorControlLink)
        .options(
            selectinload(VendorControlLink.control).selectinload(Control.department),
            selectinload(VendorControlLink.control).selectinload(Control.executions),
        )
        .where(VendorControlLink.vendor_id == vendor_id)
    )
    links = result.scalars().all()
    now = utc_now()
    context = await load_monitoring_response_context(
        db,
        now=now,
        today=now.astimezone(UTC).date(),
    )

    visible: list[LinkedControlRead] = []
    for link in links:
        if link.control and await _can_read_control(db, current_user, link.control):
            ctrl = link.control
            control_brief = serialize_control_brief_for_link(ctrl, context)
            visible.append(
                LinkedControlRead(
                    id=control_brief.id,
                    name=control_brief.name,
                    frequency=control_brief.frequency,
                    risk_level=control_brief.risk_level,
                    department_id=ctrl.department_id,
                    department_name=ctrl.department.name if getattr(ctrl, "department", None) else None,
                    status=control_brief.status,
                    monitoring_status=control_brief.monitoring_status,
                    monitoring_status_reason=control_brief.monitoring_status_reason,
                    latest_execution_result=control_brief.latest_execution_result,
                    latest_executed_at=control_brief.latest_executed_at,
                    days_since_last_execution=control_brief.days_since_last_execution,
                    execution_log_count=control_brief.execution_log_count,
                )
            )
    return visible


@router.post("/vendors/{vendor_id}/linked-controls", status_code=status.HTTP_201_CREATED)
async def link_vendor_to_control(
    vendor_id: int,
    payload: VendorControlLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    if not check_permission(current_user, "controls", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: controls:read")

    vendor = await _get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    can_modify_vendor = check_permission(current_user, "vendors", "write") or is_vendor_owner(vendor, current_user)
    if not can_modify_vendor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    result = await db.execute(
        select(Control)
        .options(selectinload(Control.department))
        .where(Control.id == payload.control_id)
    )
    control = result.scalar_one_or_none()
    if not control or not await _can_read_control(db, current_user, control):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")

    existing = await db.execute(
        select(VendorControlLink)
        .where(VendorControlLink.vendor_id == vendor_id, VendorControlLink.control_id == payload.control_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")

    link = VendorControlLink(vendor_id=vendor_id, control_id=payload.control_id)
    db.add(link)
    await db.commit()
    return {"status": "linked"}


@router.delete("/vendors/{vendor_id}/linked-controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_vendor_from_control(
    vendor_id: int,
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    if not check_permission(current_user, "controls", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: controls:read")

    vendor = await _get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    can_modify_vendor = check_permission(current_user, "vendors", "write") or is_vendor_owner(vendor, current_user)
    if not can_modify_vendor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    result = await db.execute(
        select(Control)
        .options(selectinload(Control.department))
        .where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    if not control or not await _can_read_control(db, current_user, control):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")

    result = await db.execute(
        select(VendorControlLink)
        .where(VendorControlLink.vendor_id == vendor_id, VendorControlLink.control_id == control_id)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    await db.delete(link)
    await db.commit()
    return None
