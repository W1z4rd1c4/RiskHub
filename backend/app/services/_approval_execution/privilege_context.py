"""FastAPI dependency for approval privilege context."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models import ApprovalRequest, User
from app.services.approval_scenario_policy import ApprovalPrivilegeTier, resolve_approval_privilege_tier


@dataclass(frozen=True)
class PrivilegeContext:
    user: User
    tier: ApprovalPrivilegeTier

    async def tier_for_approval(self, db: AsyncSession, approval: ApprovalRequest) -> ApprovalPrivilegeTier:
        return await resolve_approval_privilege_tier(db, self.user, approval)


async def get_privilege_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PrivilegeContext:
    tier = await resolve_approval_privilege_tier(db, current_user)
    return PrivilegeContext(user=current_user, tier=tier)
