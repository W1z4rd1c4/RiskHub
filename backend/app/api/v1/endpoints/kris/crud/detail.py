from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_vendor, check_department_access
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.schemas.kri import KRIResponse
from app.schemas.vendor_shared import LinkedVendorRead
from app.services.authorization_capabilities import kri_capabilities

router = APIRouter()


@router.get("/{kri_id}", response_model=KRIResponse)
async def get_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    include_archived: bool = Query(False, description="Include archived KRI"),
):
    """Get a single KRI by ID."""
    from app.core.permissions import is_kri_reporting_owner

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    # Archived KRIs are hidden unless explicitly requested
    if kri.is_archived and not include_archived:
        raise HTTPException(status_code=404, detail="KRI not found")

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    linked_vendors = [
        LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
        for link in getattr(kri, "vendor_links", []) or []
        if getattr(link, "vendor", None) is not None
        and check_permission(current_user, "vendors", "read")
        and can_read_vendor(link.vendor, current_user)
    ]

    # Allow access if user is reporting owner (cross-department)
    if await is_kri_reporting_owner(db, current_user.id, kri_id):
        capabilities = await kri_capabilities(db, current_user=current_user, kri=kri)
        return serialize_kri_response(kri, monitoring_context, linked_vendors=linked_vendors, capabilities=capabilities)

    # Otherwise verify department access
    check_department_access(kri.risk.department_id, current_user)

    capabilities = await kri_capabilities(db, current_user=current_user, kri=kri)
    return serialize_kri_response(kri, monitoring_context, linked_vendors=linked_vendors, capabilities=capabilities)
