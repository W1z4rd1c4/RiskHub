from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.schemas.kri import KRIResponse
from app.services._entity_mutation_lifecycle import restore_kri_detail

router = APIRouter()


@router.post("/{kri_id}/restore", response_model=KRIResponse)
async def restore_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_permission("risks", "delete")),
):
    """Restore an archived KRI."""
    return await restore_kri_detail(db=db, kri_id=kri_id, current_user=current_user)
