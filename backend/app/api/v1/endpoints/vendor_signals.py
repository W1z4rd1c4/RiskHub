from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import can_read_vendor
from app.core.security import require_permission, check_permission
from app.db.session import get_db
from app.models import User, Vendor
from app.models.vendor_external_signal import VendorExternalSignal
from app.services.vendor_signal_service import VendorSignalService

router = APIRouter()


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int, current_user: User) -> Vendor:
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


@router.get("/vendors/{vendor_id}/signals", response_model=list[dict])
async def list_vendor_signals(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    await _get_vendor_or_404(db, vendor_id, current_user)
    stmt = (
        select(VendorExternalSignal)
        .where(VendorExternalSignal.vendor_id == vendor_id)
        .order_by(desc(VendorExternalSignal.fetched_at), desc(VendorExternalSignal.id))
        .limit(200)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "vendor_id": r.vendor_id,
            "provider_key": r.provider_key,
            "signal_type": r.signal_type,
            "payload_json": r.payload_json,
            "fetched_at": r.fetched_at,
            "status": r.status.value,
            "error_message": r.error_message,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/vendors/{vendor_id}/signals/refresh", response_model=list[dict])
async def refresh_vendor_signals(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_or_404(db, vendor_id, current_user)

    # privileged roles or outsourcing owner can refresh; backend enforces via vendors:write or ownership
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and getattr(vendor, "outsourcing_owner_user_id", None) != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    results = await VendorSignalService.refresh_vendor_signals(db, vendor=vendor, force=True)
    return [
        {
            "id": r.id,
            "vendor_id": r.vendor_id,
            "provider_key": r.provider_key,
            "signal_type": r.signal_type,
            "payload_json": r.payload_json,
            "fetched_at": r.fetched_at,
            "status": r.status.value,
            "error_message": r.error_message,
            "created_at": r.created_at,
        }
        for r in results
    ]

