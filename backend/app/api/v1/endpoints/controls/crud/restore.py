from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.schemas.control import ControlRead
from app.services._entity_mutation_lifecycle import restore_control_detail

router = APIRouter()


@router.post("/{control_id}/restore", response_model=ControlRead)
async def restore_control(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_permission("controls", "delete")),
):
    """Restore an archived control back to active status."""
    return await restore_control_detail(db=db, control_id=control_id, current_user=current_user)
