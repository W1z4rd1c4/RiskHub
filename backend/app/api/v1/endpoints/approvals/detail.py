from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import can_resolve_approvals
from app.db.session import get_db
from app.models import ApprovalRequest, User
from app.schemas.approval_request import ApprovalRequestRead

from ._shared import _build_approval_read

router = APIRouter()


@router.get("/{approval_id}", response_model=ApprovalRequestRead)
async def get_approval_request(
    approval_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get a single approval request. Requester or privileged users only."""
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()

    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    # Permission check: requester or privileged user
    if approval.requested_by_id != current_user.id and not can_resolve_approvals(current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    return _build_approval_read(approval)
