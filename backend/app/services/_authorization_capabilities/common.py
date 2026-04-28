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


def has_pending_action(approvals: list[ApprovalRequest], action: ApprovalActionType) -> bool:
    return any(approval.action_type == action for approval in approvals)
