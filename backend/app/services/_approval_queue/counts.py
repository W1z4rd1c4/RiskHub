from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRequest, ApprovalStatus, User
from app.services.approval_queue_visibility import count_visible_pending_approvals_for_user
from app.services.approval_scenario_policy import approval_privilege_tier


async def count_pending_approval_queue(*, db: AsyncSession, current_user: User) -> dict[str, int]:
    if approval_privilege_tier(current_user).is_privileged:
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
        return {"count": result.scalar() or 0}

    return {"count": await count_visible_pending_approvals_for_user(db, current_user=current_user)}
