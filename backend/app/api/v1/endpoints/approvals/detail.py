from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import ApprovalRequest, GovernedMutationProposal, Process
from app.schemas.approval_request import ApprovalRequestRead
from app.services._approval_execution.privilege_context import PrivilegeContext, get_privilege_context
from app.services._approval_queue.projection import build_approval_read
from app.services._governed_mutations.process_identity import (
    InvalidGovernedProcessIdentity,
    strict_governed_process_identity,
)
from app.services._ict_register_lifecycle.policy import can_use_process_assignment_lookup
from app.services.approval_scenario_policy import (
    can_resolve_scenario_approval,
    can_view_approval_resource,
    can_view_governed_process_snapshot,
    is_governed_process_approval,
)

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
        .options(
            selectinload(ApprovalRequest.requested_by),
            selectinload(ApprovalRequest.resolved_by),
            selectinload(ApprovalRequest.governed_mutation_proposal),
            selectinload(ApprovalRequest.governed_mutation_proposal).selectinload(
                GovernedMutationProposal.requested_by
            ),
        )
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()

    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    tier = await ctx.tier_for_approval(db, approval)
    is_governed_process = is_governed_process_approval(approval)
    is_scenario_approver = await can_resolve_scenario_approval(
        db, ctx.user, approval
    )
    identity = None
    if approval.governed_mutation_proposal is not None and not is_governed_process:
        raise HTTPException(status_code=403, detail="Access denied")
    if is_governed_process:
        try:
            identity = strict_governed_process_identity(
                approval.governed_mutation_proposal
            )
        except InvalidGovernedProcessIdentity:
            raise HTTPException(status_code=403, detail="Access denied") from None
        assert identity is not None
        can_access = (
            identity.requested_by_id == ctx.user.id or is_scenario_approver
        )
    else:
        can_access = (
            tier.is_requester
            or tier.is_primary_approver
            or tier.is_privileged
            or is_scenario_approver
        )
    if not can_access:
        raise HTTPException(status_code=403, detail="Access denied")

    if is_governed_process:
        assert identity is not None
        process = await db.get(Process, identity.primary_resource_id)
        can_view_governed_snapshot = bool(
            process is not None
            and can_view_governed_process_snapshot(
                ctx.user,
                process,
                requester_id=identity.requested_by_id,
                configured_roles=identity.approver_roles,
            )
        )
    else:
        can_view_governed_snapshot = await can_view_approval_resource(
            db, ctx.user, approval
        )

    return build_approval_read(
        approval,
        ctx.user,
        can_view_governed_snapshot=can_view_governed_snapshot,
        governed_resolver=is_scenario_approver,
        can_view_governed_references=await can_use_process_assignment_lookup(
            db,
            current_user=ctx.user,
        ),
    )
