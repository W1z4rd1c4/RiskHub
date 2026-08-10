from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceFailure
from app.models import Role, User
from app.models.role import RoleType
from app.services._orphaned_items import flag_orphaned_items, flag_orphaned_threats


async def role_change_removes_ciso_stewardship(
    db: AsyncSession,
    *,
    user: User,
    new_role: Role,
) -> bool:
    """Return whether a role update removes an active CISO stewardship identity."""
    if not user.is_active or new_role.id == user.role_id:
        return False
    current_role_name = (
        await db.execute(select(Role.name).where(Role.id == user.role_id))
    ).scalar_one()
    return current_role_name == RoleType.CISO and new_role.name != RoleType.CISO


async def flag_orphaned_items_for_deactivation(db: AsyncSession, *, user: User) -> int:
    """Flag every owned item after full identity loss, preserving ownership FKs."""
    try:
        created_orphans = await flag_orphaned_items(db, user.id)
    except Exception as exc:
        await db.rollback()
        raise ServiceFailure("Failed to flag orphaned items") from exc
    return len(created_orphans)


async def flag_orphaned_threats_for_ciso_role_loss(
    db: AsyncSession,
    *,
    user: User,
) -> int:
    """Flag only Threats after an active CISO loses the stewardship role."""
    try:
        created_orphans = await flag_orphaned_threats(db, user.id)
    except Exception as exc:
        await db.rollback()
        raise ServiceFailure("Failed to flag orphaned threats") from exc
    return len(created_orphans)
