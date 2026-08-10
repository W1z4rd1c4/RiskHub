from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.approval_queue_visibility import count_visible_pending_approvals_for_user


async def count_pending_approval_queue(*, db: AsyncSession, current_user: User) -> dict[str, int]:
    return {"count": await count_visible_pending_approvals_for_user(db, current_user=current_user)}
