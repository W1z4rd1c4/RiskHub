from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.threat import ThreatRead
from app.services._ict_register_lifecycle.threat_lifecycle import archive_threat_detail, restore_threat_detail

router = APIRouter()


@router.delete("/{threat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_threat(
    threat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "delete")),
):
    await archive_threat_detail(db=db, threat_id=threat_id, current_user=current_user)
    return None


@router.post("/{threat_id}/restore", response_model=ThreatRead)
async def restore_threat(
    threat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "delete")),
):
    return await restore_threat_detail(db=db, threat_id=threat_id, current_user=current_user)
