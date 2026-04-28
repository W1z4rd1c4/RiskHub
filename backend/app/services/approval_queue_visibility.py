"""Approval queue visibility helpers."""

from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus, User
from app.services.approval_scenario_policy import can_view_approval_resource, user_matches_approval_scenario_role

PENDING_APPROVAL_STATUSES = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)


async def can_view_pending_approval_queue_item(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    current_user: User,
    include_requester: bool = True,
) -> bool:
    """Return whether a non-privileged user should see an approval as pending queue work."""
    if (
        include_requester
        and approval.requested_by_id == current_user.id
        and approval.status in PENDING_APPROVAL_STATUSES
    ):
        return True
    if approval.requested_by_id == current_user.id:
        return False
    if approval.primary_approver_id == current_user.id and approval.status == ApprovalStatus.PENDING:
        return True
    if approval.status != ApprovalStatus.PENDING:
        return False
    if user_matches_approval_scenario_role(approval, current_user) is not True:
        return False
    return await can_view_approval_resource(db, current_user, approval)


async def visible_pending_approvals_for_user(
    db: AsyncSession,
    *,
    current_user: User,
    resource_type: ApprovalResourceType | None = None,
    include_requester: bool = True,
) -> list[ApprovalRequest]:
    """Load non-privileged pending approvals visible to requester, primary, or scenario approver."""
    candidate_clauses = [
        and_(
            ApprovalRequest.primary_approver_id == current_user.id,
            ApprovalRequest.status == ApprovalStatus.PENDING,
        ),
        and_(
            ApprovalRequest.status == ApprovalStatus.PENDING,
            ApprovalRequest.scenario_approver_roles.is_not(None),
        ),
    ]
    if include_requester:
        candidate_clauses.append(
            and_(
                ApprovalRequest.requested_by_id == current_user.id,
                ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
            )
        )

    query = (
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(or_(*candidate_clauses))
        .order_by(ApprovalRequest.created_at.desc(), ApprovalRequest.id.desc())
    )
    if resource_type is not None:
        query = query.where(ApprovalRequest.resource_type == resource_type)

    result = await db.execute(query)
    candidates = result.scalars().all()
    return [
        approval
        for approval in candidates
        if await can_view_pending_approval_queue_item(
            db,
            approval=approval,
            current_user=current_user,
            include_requester=include_requester,
        )
    ]


async def count_visible_pending_approvals_for_user(
    db: AsyncSession,
    *,
    current_user: User,
) -> int:
    """Count non-privileged pending approvals visible to requester, primary, or scenario approver."""
    return len(await visible_pending_approvals_for_user(db, current_user=current_user))
