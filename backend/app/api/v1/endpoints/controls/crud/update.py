from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.control import ControlRead, ControlUpdate
from app.services._entity_mutation_lifecycle.lifecycle import update_control_detail

router = APIRouter()
APPROVAL_QUEUED_RESPONSE: dict[int | str, dict[str, Any]] = {202: {"model": ApprovalQueuedResponse}}


@router.patch("/{control_id}", response_model=ControlRead, responses=APPROVAL_QUEUED_RESPONSE)
async def update_control(
    control_id: int,
    control_data: ControlUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a control. Requires controls:write permission OR being the control owner.
    Non-privileged users editing controls linked to critical risks or changing
    sensitive fields (owner, department) will trigger an approval request.
    """
    outcome = await update_control_detail(
        db=db,
        control_id=control_id,
        update_data=control_data.model_dump(exclude_unset=True),
        current_user=current_user,
    )
    return outcome.response
