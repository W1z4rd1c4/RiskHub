from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.asset import AssetVendorLinkRead
from app.schemas.process import ProcessVendorLinkRead
from app.services._ict_register_lifecycle.vendor_links import (
    list_vendor_asset_links,
    list_vendor_process_links,
)

router = APIRouter()


@router.get("/{vendor_id}/asset-links", response_model=list[AssetVendorLinkRead])
async def list_vendor_asset_links_route(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    """The Vendor-end read of the Asset<->Vendor Link relation (issue #46)."""
    return await list_vendor_asset_links(db, vendor_id=vendor_id, current_user=current_user)


@router.get("/{vendor_id}/process-links", response_model=list[ProcessVendorLinkRead])
async def list_vendor_process_links_route(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    """The Vendor-end read of the Process<->Vendor Link relation (issue #46)."""
    return await list_vendor_process_links(db, vendor_id=vendor_id, current_user=current_user)
