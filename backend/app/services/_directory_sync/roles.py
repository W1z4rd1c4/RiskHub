from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES
from app.models import Role


async def _resolve_default_role(db: AsyncSession) -> Role:
    """Resolve a safe default role for new directory users.

    Only returns non-privileged roles (employee, control_owner, viewer).
    Raises ValueError if no suitable role exists - never falls back to privileged roles.
    """
    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise ValueError(f"No safe default role found ({candidates}). " "Seed roles before syncing directory users.")

