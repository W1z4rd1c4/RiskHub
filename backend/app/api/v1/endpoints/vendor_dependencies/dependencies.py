from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.security import check_permission
from app.db.session import get_db
from app.models import User
from app.models.vendor_service import VendorDependency, VendorService
from app.schemas.vendor_dependency import VendorDependencyCreate, VendorDependencyRead

from ._shared import (
    _assert_department_exists,
    _assert_risk_in_scope,
    _dependency_read,
    _get_vendor_or_404,
    _require_vendor_write,
)

router = APIRouter()


@router.post(
    "/vendor-services/{service_id}/dependencies",
    response_model=VendorDependencyRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_vendor_dependency(
    service_id: int,
    payload: VendorDependencyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    service = (await db.execute(select(VendorService).where(VendorService.id == service_id))).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor service not found")
    vendor = await _get_vendor_or_404(db, service.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    if payload.department_id is not None:
        await _assert_department_exists(db, department_id=payload.department_id)

    if payload.risk_id is not None:
        await _assert_risk_in_scope(db, risk_id=payload.risk_id, current_user=current_user)

    dep = VendorDependency(
        vendor_service_id=service_id,
        risk_id=payload.risk_id,
        department_id=payload.department_id,
        supported_function_name=payload.supported_function_name,
    )
    db.add(dep)
    await db.commit()
    await db.refresh(dep)

    dep = (
        await db.execute(
            select(VendorDependency)
            .options(selectinload(VendorDependency.risk), selectinload(VendorDependency.department))
            .where(VendorDependency.id == dep.id)
        )
    ).scalar_one()

    return _dependency_read(dep, current_user=current_user)


@router.delete("/vendor-dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_dependency(
    dependency_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    dep = (await db.execute(select(VendorDependency).where(VendorDependency.id == dependency_id))).scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dependency not found")
    service = (await db.execute(select(VendorService).where(VendorService.id == dep.vendor_service_id))).scalar_one()
    vendor = await _get_vendor_or_404(db, service.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(dep)
    await db.commit()
    return None
