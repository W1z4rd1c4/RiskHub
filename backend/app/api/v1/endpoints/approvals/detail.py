from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import ApprovalRequest
from app.schemas.approval_request import ApprovalRequestRead
from app.services._approval_execution.privilege_context import PrivilegeContext, get_privilege_context
from app.services._approval_queue.projection import build_approval_read
from app.services.approval_scenario_policy import can_view_approval_resource

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
    ctx: PrivilegeContext = Depends(get_privilege_context),
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

    tier = await ctx.tier_for_approval(db, approval)
    is_scenario_approver = tier.scenario_match is True and await can_view_approval_resource(db, ctx.user, approval)

    # Permission check: requester, primary approver, or approval resolver
    if (
        not tier.is_requester
        and not tier.is_primary_approver
        and not tier.is_privileged
        and not is_scenario_approver
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    return build_approval_read(approval, ctx.user)
