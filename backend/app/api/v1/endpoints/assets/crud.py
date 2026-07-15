from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.asset import AssetCreate, AssetListResponse, AssetRead, AssetUpdate
from app.schemas.collection import SortDirection
from app.services._ict_register_lifecycle.asset_lifecycle import (
    create_asset_detail,
    list_asset_register,
    read_asset_detail,
    update_asset_detail,
)

router = APIRouter()


@router.get("", response_model=AssetListResponse)
async def list_assets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "read")),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived assets"),
    sort_by: Optional[str] = None,
    sort_order: SortDirection = Query("asc"),
    has_process_link: bool | None = Query(None),
    criticality: str | None = Query(None, description="Filter by derived resulting criticality"),
):
    return await list_asset_register(
        db=db,
        current_user=current_user,
        offset=offset,
        limit=limit,
        search=search,
        include_archived=include_archived,
        sort_by=sort_by,
        sort_order=sort_order,
        has_process_link=has_process_link,
        criticality=criticality,
    )


@router.post("", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
async def create_asset(
    payload: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    return await create_asset_detail(db=db, payload=payload, current_user=current_user)


@router.get("/{asset_id}", response_model=AssetRead)
async def get_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "read")),
):
    return await read_asset_detail(db=db, asset_id=asset_id, current_user=current_user)


@router.patch("/{asset_id}", response_model=AssetRead)
async def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "write")),
):
    return await update_asset_detail(db=db, asset_id=asset_id, payload=payload, current_user=current_user)
