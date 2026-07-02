from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.kri import KRIResponse, KRIUpdate
from app.services._entity_mutation_lifecycle.lifecycle import update_kri_detail

router = APIRouter()
APPROVAL_QUEUED_RESPONSE: dict[int | str, dict[str, Any]] = {202: {"model": ApprovalQueuedResponse}}


@router.patch("/{kri_id}", response_model=KRIResponse, responses=APPROVAL_QUEUED_RESPONSE)
@router.put(
    "/{kri_id}",
    response_model=KRIResponse,
    responses=APPROVAL_QUEUED_RESPONSE,
    deprecated=True,
    description="Deprecated alias for PATCH: applies partial-update semantics despite the PUT verb.",
)
async def update_kri(
    kri_id: int,
    data: KRIUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """
    Partially update a KRI (unset fields are left untouched). Non-privileged
    users editing any KRI will trigger an approval request instead of
    immediate update.
    """
    outcome = await update_kri_detail(
        db=db,
        kri_id=kri_id,
        update_data=data.model_dump(exclude_unset=True),
        current_user=current_user,
    )
    return outcome.response
