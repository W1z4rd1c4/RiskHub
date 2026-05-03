from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.risk import RiskRead, RiskUpdate
from app.services._entity_mutation_lifecycle.lifecycle import update_risk_detail

router = APIRouter()
APPROVAL_QUEUED_RESPONSE: dict[int | str, dict[str, Any]] = {202: {"model": ApprovalQueuedResponse}}


@router.patch("/{risk_id}", response_model=RiskRead, responses=APPROVAL_QUEUED_RESPONSE)
async def update_risk(
    risk_id: int,
    risk_data: RiskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a risk. Requires risks:write permission OR being the risk owner.
    Non-privileged users changing sensitive fields (owner, department, category, is_priority)
    will trigger an approval request instead of immediate update.
    """
    outcome = await update_risk_detail(
        db=db,
        risk_id=risk_id,
        update_data=risk_data.model_dump(exclude_unset=True),
        current_user=current_user,
    )
    return outcome.response
