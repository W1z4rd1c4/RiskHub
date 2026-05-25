from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.schemas.risk import RiskRead
from app.services._entity_mutation_lifecycle import restore_risk_detail

router = APIRouter()


@router.post("/{risk_id}/restore", response_model=RiskRead)
async def restore_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_permission("risks", "delete")),
):
    """Restore an archived risk back to active status."""
    return await restore_risk_detail(db=db, risk_id=risk_id, current_user=current_user)
