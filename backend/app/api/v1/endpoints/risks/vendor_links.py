from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.vendor import vendor_to_read
from app.core.permissions import can_read_risk_id, can_read_vendor
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User, Vendor, VendorRiskLink

router = APIRouter()


@router.get("/{risk_id}/vendors", response_model=list[dict])
async def list_risk_vendors(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """
    List vendors linked to this risk.

    - Caller must be authorized to access the risk (same patterns as risk-control linking)
    - Returned vendors are filtered by vendor visibility rules to avoid leaking existence
    - If caller lacks vendors:read permission, returns an empty list
    """
    if not check_permission(current_user, "vendors", "read"):
        return []

    # Anti-enumeration: 404 if risk not found OR not visible by scope/ownership
    if not await can_read_risk_id(db, current_user, risk_id):
        raise HTTPException(status_code=404, detail="Risk not found")

    result = await db.execute(
        select(Vendor)
        .join(VendorRiskLink, Vendor.id == VendorRiskLink.vendor_id)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(VendorRiskLink.risk_id == risk_id)
        .order_by(asc(Vendor.name))
    )
    linked_vendors = result.scalars().all()

    visible_vendors = [v for v in linked_vendors if can_read_vendor(v, current_user)]

    return [
        vendor_to_read(v).model_dump()
        for v in visible_vendors
    ]

