from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.approval_helpers import create_approval_request_with_audit
from app.models import ApprovalActionType, ApprovalRequest, ApprovalStatus, User
from app.schemas.approval_request import ApprovalRequestCreate, ApprovalRequestRead
from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy

from .contracts import ApprovalRequestIntakePlan
from .delete_intake import build_delete_intake_plan, ensure_delete_approval_not_pending
from .projection import build_approval_read


DELETE_SCENARIO_DEFAULT_ROLES = ["risk_owner", "risk_manager", "cro"]


async def create_delete_approval_request(
    *,
    db: AsyncSession,
    request_data: ApprovalRequestCreate,
    current_user: User,
) -> ApprovalRequestRead:
    plan = await build_delete_intake_plan(db=db, request_data=request_data, current_user=current_user)
    scenario_policy = await load_approval_scenario_policy(
        db,
        plan.scenario_key,
        default_roles=DELETE_SCENARIO_DEFAULT_ROLES,
    )
    if not scenario_policy.requires_approval:
        raise HTTPException(status_code=400, detail="This delete scenario does not require approval")

    await ensure_delete_approval_not_pending(db, plan=plan)
    approval = build_delete_approval_request(plan=plan, request_data=request_data, current_user=current_user)
    apply_approval_scenario_snapshot(approval, scenario_policy)
    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=plan.department_id,
        on_duplicate_detail="An approval request is already pending for this action.",
    )

    reloaded = await reload_delete_approval_request(db, approval_id=approval.id)
    return build_approval_read(reloaded, current_user)


def build_delete_approval_request(
    *,
    plan: ApprovalRequestIntakePlan,
    request_data: ApprovalRequestCreate,
    current_user: User,
) -> ApprovalRequest:
    return ApprovalRequest(
        resource_type=plan.resource_type,
        resource_id=plan.resource_id,
        resource_name=plan.resource_name,
        action_type=ApprovalActionType.DELETE,
        requested_by_id=current_user.id,
        reason=request_data.reason,
        status=ApprovalStatus.PENDING,
        primary_approver_id=plan.primary_approver_id,
        requires_privileged_approval=plan.requires_privileged_approval,
    )


async def reload_delete_approval_request(db: AsyncSession, *, approval_id: int) -> ApprovalRequest:
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    return result.scalar_one()
