from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission
from app.db.session import get_db
from app.models import User, Vendor, VendorRiskFactor
from app.schemas.vendor_risk_factor import VendorRiskFactorCreate, VendorRiskFactorRead, VendorRiskFactorUpdate

router = APIRouter()


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


@router.get("/vendors/{vendor_id}/risk-factors", response_model=list[VendorRiskFactorRead])
async def list_vendor_risk_factors(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_or_404(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    result = await db.execute(
        select(VendorRiskFactor).where(VendorRiskFactor.vendor_id == vendor_id).order_by(VendorRiskFactor.id.asc())
    )
    return result.scalars().all()


@router.post(
    "/vendors/{vendor_id}/risk-factors", response_model=VendorRiskFactorRead, status_code=status.HTTP_201_CREATED
)
async def create_vendor_risk_factor(
    vendor_id: int,
    payload: VendorRiskFactorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_or_404(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    can_write = check_permission(current_user, "vendors", "write") or is_vendor_owner(vendor, current_user)
    if not can_write:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    factor = VendorRiskFactor(
        vendor_id=vendor_id,
        category_key=payload.category_key.value,
        description=payload.description,
    )
    db.add(factor)
    await db.commit()
    await db.refresh(factor)
    return factor


@router.patch("/vendor-risk-factors/{factor_id}", response_model=VendorRiskFactorRead)
async def update_vendor_risk_factor(
    factor_id: int,
    payload: VendorRiskFactorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    result = await db.execute(
        select(VendorRiskFactor).options(selectinload(VendorRiskFactor.vendor)).where(VendorRiskFactor.id == factor_id)
    )
    factor = result.scalar_one_or_none()
    if not factor or not factor.vendor or not can_read_vendor(factor.vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk factor not found")

    can_write = check_permission(current_user, "vendors", "write") or is_vendor_owner(factor.vendor, current_user)
    if not can_write:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    if "category_key" in updates and updates["category_key"] is not None:
        factor.category_key = updates["category_key"].value
    if "description" in updates and updates["description"] is not None:
        factor.description = updates["description"]

    await db.commit()
    await db.refresh(factor)
    return factor


@router.delete("/vendor-risk-factors/{factor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_risk_factor(
    factor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    result = await db.execute(
        select(VendorRiskFactor).options(selectinload(VendorRiskFactor.vendor)).where(VendorRiskFactor.id == factor_id)
    )
    factor = result.scalar_one_or_none()
    if not factor or not factor.vendor or not can_read_vendor(factor.vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk factor not found")

    can_write = check_permission(current_user, "vendors", "write") or is_vendor_owner(factor.vendor, current_user)
    if not can_write:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    await db.delete(factor)
    await db.commit()
    return None
