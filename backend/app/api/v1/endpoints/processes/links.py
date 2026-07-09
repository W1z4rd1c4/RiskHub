from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.asset import ProcessAssetLinkRead
from app.services._ict_register_lifecycle.asset_links import list_process_asset_links

router = APIRouter()


@router.get("/{process_id}/asset-links", response_model=list[ProcessAssetLinkRead])
async def list_process_asset_links_route(
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "read")),
):
    """The Process-end read of the Process<->Asset Link relation (issue #43)."""
    return await list_process_asset_links(db, process_id=process_id, current_user=current_user)
