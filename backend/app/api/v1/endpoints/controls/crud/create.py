from fastapi import Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.control import ControlCreate, ControlRead
from app.services._entity_mutation_lifecycle import create_control_detail

from .list import router


@router.post("", response_model=ControlRead, status_code=status.HTTP_201_CREATED)
async def create_control(
    control_data: ControlCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Create a new control. Requires controls:write permission."""
    return await create_control_detail(db=db, control_data=control_data, current_user=current_user)
