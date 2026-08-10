from __future__ import annotations

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.asset import AssetArchiveRequest, AssetRead
from app.services._ict_register_lifecycle.asset_lifecycle import archive_asset_detail, restore_asset_detail

router = APIRouter()


@router.delete(
    "/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def archive_asset(
    asset_id: int,
    payload: AssetArchiveRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "delete")),
):
    return await archive_asset_detail(
        db=db,
        asset_id=asset_id,
        current_user=current_user,
        request_reason=payload.request_reason if payload is not None else None,
    )


@router.post("/{asset_id}/restore", response_model=AssetRead)
async def restore_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assets", "delete")),
):
    return await restore_asset_detail(db=db, asset_id=asset_id, current_user=current_user)
