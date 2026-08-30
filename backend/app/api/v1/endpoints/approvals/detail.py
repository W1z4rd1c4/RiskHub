from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import ApprovalRequest, GovernedMutationProposal
from app.schemas.approval_request import ApprovalRequestRead
from app.services._approval_execution.privilege_context import PrivilegeContext, get_privilege_context
from app.services._approval_queue.projection import (
    build_approval_read,
    governed_process_actor_safe_labels,
    legacy_pending_change_actor_safe_labels,
)
from app.services._ict_register_lifecycle.policy import can_use_process_assignment_lookup
from app.services.approval_scenario_policy import (
    can_resolve_scenario_approval,
    can_view_approval_resource,
    governed_process_response_policy,
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
    response_policy = None
    if approval.governed_mutation_proposal is not None:
        try:
            response_policy = await governed_process_response_policy(
                db,
                approval=approval,
                user=ctx.user,
            )
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied") from None
        if response_policy is None:
            raise HTTPException(status_code=403, detail="Access denied")
        can_access = response_policy.can_access
        is_scenario_approver = response_policy.can_resolve
    else:
        is_scenario_approver = await can_resolve_scenario_approval(db, ctx.user, approval)
        can_access = tier.is_requester or tier.is_primary_approver or tier.is_privileged or is_scenario_approver
    if not can_access:
        raise HTTPException(status_code=403, detail="Access denied")

    if response_policy is not None:
        can_view_governed_snapshot = response_policy.can_view_snapshot
    else:
        can_view_governed_snapshot = await can_view_approval_resource(db, ctx.user, approval)

    actor_safe_labels = await governed_process_actor_safe_labels(
        db,
        approvals=[approval],
        current_user=ctx.user,
    )
    actor_safe_legacy_labels = await legacy_pending_change_actor_safe_labels(
        db,
        approvals=[approval],
        current_user=ctx.user,
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
        actor_safe_extended_labels=actor_safe_labels.get(approval.id),
        actor_safe_legacy_labels=actor_safe_legacy_labels,
    )
