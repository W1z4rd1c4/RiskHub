from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.services._entity_mutation_lifecycle.lifecycle import archive_kri_detail

router = APIRouter()
APPROVAL_QUEUED_RESPONSE: dict[int | str, dict[str, Any]] = {202: {"model": ApprovalQueuedResponse}}


@router.delete("/{kri_id}", status_code=202, responses=APPROVAL_QUEUED_RESPONSE)
async def delete_kri(
    kri_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Request deletion of a KRI.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    outcome = await archive_kri_detail(
        db=db,
        kri_id=kri_id,
        reason=reason,
        current_user=current_user,
    )
    return outcome.response
