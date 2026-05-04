from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_resolve_approvals
from app.models import ApprovalRequest, ApprovalStatus, User
from app.services.approval_queue_visibility import count_visible_pending_approvals_for_user


async def count_pending_approval_queue(*, db: AsyncSession, current_user: User) -> dict[str, int]:
    if can_resolve_approvals(current_user):
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
        return {"count": result.scalar() or 0}

    return {"count": await count_visible_pending_approvals_for_user(db, current_user=current_user)}
