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


@router.get(
    "/{approval_id}",
    response_model=ApprovalRequestRead,
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Authenticated user cannot access this approval request."},
        404: {"description": "Approval request not found."},
    },
)
async def get_approval_request(
    approval_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get a single approval request for requester, primary approver, or approval resolvers."""
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()

    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    is_requester = approval.requested_by_id == current_user.id
    is_primary_approver = approval.primary_approver_id == current_user.id
    is_privileged = can_resolve_approvals(current_user)

    # Permission check: requester, primary approver, or approval resolver
    if not is_requester and not is_primary_approver and not is_privileged:
        raise HTTPException(status_code=403, detail="Access denied")

    return _build_approval_read(approval, current_user)
