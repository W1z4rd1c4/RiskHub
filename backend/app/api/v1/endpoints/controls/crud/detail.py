from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, User
from app.schemas.control import ControlRead

router = APIRouter()


@router.get("/{control_id}", response_model=ControlRead)
async def get_control(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
):
    """Get a single control with all relationships."""
    from app.core.permissions import is_control_owner

    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
        )
        .where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()

    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Allow access if user is control owner (cross-department)
    if await is_control_owner(db, current_user.id, control_id):
        return control

    # Otherwise verify department access
    try:
        check_department_access(control.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Control not found")

    return control

