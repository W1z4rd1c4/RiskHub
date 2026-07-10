from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.asset import (
    AssetAssetLinkCreate,
    AssetAssetLinkRead,
    AssetVendorLinkCreate,
    AssetVendorLinkRead,
    ProcessAssetLinkCreate,
    ProcessAssetLinkRead,
    ProcessAssetLinkUpdate,
)
from app.services._ict_register_lifecycle.asset_links import (
    add_asset_asset_link,
    add_asset_process_link,
    list_asset_asset_links,
    list_asset_process_links,
    remove_asset_asset_link,
    remove_asset_process_link,
    update_asset_process_link,
)
from app.services._ict_register_lifecycle.vendor_links import (
    add_asset_vendor_link,
    list_asset_vendor_links,
    remove_asset_vendor_link,
)

router = APIRouter()


@router.get("/{asset_id}/process-links", response_model=list[ProcessAssetLinkRead])
async def list_asset_process_links_route(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "read")),
):
    return await list_asset_process_links(db, asset_id=asset_id, current_user=current_user)


@router.post(
    "/{asset_id}/process-links",
    response_model=ProcessAssetLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_asset_process_link(
    asset_id: int,
    payload: ProcessAssetLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    return await add_asset_process_link(db, asset_id=asset_id, payload=payload, current_user=current_user)


@router.patch("/{asset_id}/process-links/{process_id}", response_model=ProcessAssetLinkRead)
async def update_asset_process_link_route(
    asset_id: int,
    process_id: int,
    payload: ProcessAssetLinkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    return await update_asset_process_link(
        db, asset_id=asset_id, process_id=process_id, payload=payload, current_user=current_user
    )


@router.delete("/{asset_id}/process-links/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset_process_link(
    asset_id: int,
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    await remove_asset_process_link(db, asset_id=asset_id, process_id=process_id, current_user=current_user)
    return None


@router.get("/{asset_id}/asset-links", response_model=list[AssetAssetLinkRead])
async def list_asset_asset_links_route(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "read")),
):
    return await list_asset_asset_links(db, asset_id=asset_id, current_user=current_user)


@router.post(
    "/{asset_id}/asset-links",
    response_model=AssetAssetLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_asset_asset_link(
    asset_id: int,
    payload: AssetAssetLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    return await add_asset_asset_link(db, asset_id=asset_id, payload=payload, current_user=current_user)


@router.delete("/{asset_id}/asset-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset_asset_link(
    asset_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    await remove_asset_asset_link(db, asset_id=asset_id, link_id=link_id, current_user=current_user)
    return None


@router.get("/{asset_id}/vendor-links", response_model=list[AssetVendorLinkRead])
async def list_asset_vendor_links_route(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "read")),
):
    return await list_asset_vendor_links(db, asset_id=asset_id, current_user=current_user)


@router.post(
    "/{asset_id}/vendor-links",
    response_model=AssetVendorLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_asset_vendor_link(
    asset_id: int,
    payload: AssetVendorLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    return await add_asset_vendor_link(db, asset_id=asset_id, payload=payload, current_user=current_user)


@router.delete("/{asset_id}/vendor-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset_vendor_link(
    asset_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    await remove_asset_vendor_link(db, asset_id=asset_id, link_id=link_id, current_user=current_user)
    return None
