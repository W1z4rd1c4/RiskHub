from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import can_read_vendor, is_vendor_owner, check_department_access, is_control_owner
from app.core.security import check_permission
from app.db.session import get_db
from app.models import (
    User,
    Vendor,
    Risk,
    Control,
    VendorRiskLink,
    VendorControlLink,
)
from app.schemas.vendor_links import VendorRiskLinkCreate, VendorControlLinkCreate, LinkedRiskRead, LinkedControlRead

router = APIRouter()


async def _get_vendor(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


async def _can_read_risk(db: AsyncSession, current_user: User, risk_id: int) -> bool:
    from app.core.permissions import is_risk_kri_reporting_owner, is_risk_control_owner
    if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
        return True
    if await is_risk_control_owner(db, current_user.id, risk_id):
        return True
    result = await db.execute(select(Risk.department_id).where(Risk.id == risk_id))
    dept_id = result.scalar_one_or_none()
    if dept_id is None:
        return False
    try:
        check_department_access(dept_id, current_user)
        return True
    except HTTPException:
        return False


async def _can_read_control(db: AsyncSession, current_user: User, control: Control) -> bool:
    if await is_control_owner(db, current_user.id, control.id):
        return True
    try:
        check_department_access(control.department_id, current_user)
        return True
    except HTTPException:
        return False


@router.get("/vendors/{vendor_id}/linked-risks", response_model=list[LinkedRiskRead])
async def list_vendor_linked_risks(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

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
                    category=risk.category,
                    department_id=risk.department_id,
                    department_name=risk.department.name if getattr(risk, "department", None) else None,
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

    vendor = await _get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    result = await db.execute(
        select(VendorControlLink)
        .options(selectinload(VendorControlLink.control).selectinload(Control.department))
        .where(VendorControlLink.vendor_id == vendor_id)
    )
    links = result.scalars().all()

    visible: list[LinkedControlRead] = []
    for link in links:
        if link.control and await _can_read_control(db, current_user, link.control):
            ctrl = link.control
            visible.append(
                LinkedControlRead(
                    id=ctrl.id,
                    name=ctrl.name,
                    department_id=ctrl.department_id,
                    department_name=ctrl.department.name if getattr(ctrl, "department", None) else None,
                    status=getattr(ctrl, "status", None),
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
