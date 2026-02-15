from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.security import check_permission
from app.db.session import get_db
from app.models import User
from app.schemas.vendor_sla import VendorSLAHistoryResponse
from app.services.vendor_sla_history_service import VendorSLAHistoryService

from ._shared import _can_read_sla, _get_sla_or_404

router = APIRouter()


@router.get("/vendor-slas/{sla_id}/history", response_model=VendorSLAHistoryResponse)
async def get_vendor_sla_history(
    sla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    limit: int = Query(100, ge=1, le=500),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    items = await VendorSLAHistoryService.history(db, sla_id=sla_id, limit=limit)
    return VendorSLAHistoryResponse(sla_id=sla_id, items=items)

