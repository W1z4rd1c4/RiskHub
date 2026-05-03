from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

PENDING_APPROVAL_STATUSES = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)


async def pending_approvals(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
) -> list[ApprovalRequest]:
    result = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == resource_type,
            ApprovalRequest.resource_id == resource_id,
            ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
        )
    )
    return list(result.scalars().all())


async def pending_approvals_for_resources(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_ids: set[int],
) -> dict[int, list[ApprovalRequest]]:
    if not resource_ids:
        return {}
    result = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == resource_type,
            ApprovalRequest.resource_id.in_(resource_ids),
            ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
        )
    )
    approvals_by_resource: dict[int, list[ApprovalRequest]] = {resource_id: [] for resource_id in resource_ids}
    for approval in result.scalars().all():
        if approval.resource_id is not None:
            approvals_by_resource.setdefault(approval.resource_id, []).append(approval)
    return approvals_by_resource


def has_pending_action(approvals: list[ApprovalRequest], action: ApprovalActionType) -> bool:
    return any(approval.action_type == action for approval in approvals)
