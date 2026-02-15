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
from app.schemas.vendor_dependency import VendorServiceCreate, VendorServiceRead, VendorServiceUpdate

from ._shared import _dependency_read, _get_vendor_or_404, _require_vendor_write

router = APIRouter()


@router.post("/vendors/{vendor_id}/services", response_model=VendorServiceRead, status_code=status.HTTP_201_CREATED)
async def create_vendor_service(
    vendor_id: int,
    payload: VendorServiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    service = VendorService(vendor_id=vendor_id, service_name=payload.service_name, notes=payload.notes)
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return VendorServiceRead(
        id=service.id,
        vendor_id=service.vendor_id,
        service_name=service.service_name,
        notes=service.notes,
        dependencies=[],
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


@router.patch("/vendor-services/{service_id}", response_model=VendorServiceRead)
async def update_vendor_service(
    service_id: int,
    payload: VendorServiceUpdate,
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

    if payload.service_name is not None:
        service.service_name = payload.service_name
    if payload.notes is not None:
        service.notes = payload.notes

    await db.commit()
    await db.refresh(service)

    # Load dependencies for response
    service = (
        await db.execute(
            select(VendorService)
            .options(
                selectinload(VendorService.dependencies).selectinload(VendorDependency.risk),
                selectinload(VendorService.dependencies).selectinload(VendorDependency.department),
            )
            .where(VendorService.id == service_id)
        )
    ).scalar_one()

    deps_read = [_dependency_read(d, current_user=current_user) for d in service.dependencies]

    return VendorServiceRead(
        id=service.id,
        vendor_id=service.vendor_id,
        service_name=service.service_name,
        notes=service.notes,
        dependencies=deps_read,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


@router.delete("/vendor-services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_service(
    service_id: int,
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
    await db.delete(service)
    await db.commit()
    return None

