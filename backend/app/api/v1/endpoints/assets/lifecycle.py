from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.asset import AssetRead
from app.services._ict_register_lifecycle.asset_lifecycle import archive_asset_detail, restore_asset_detail

router = APIRouter()


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "delete")),
):
    await archive_asset_detail(db=db, asset_id=asset_id, current_user=current_user)
    return None


@router.post("/{asset_id}/restore", response_model=AssetRead)
async def restore_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "delete")),
):
    return await restore_asset_detail(db=db, asset_id=asset_id, current_user=current_user)
