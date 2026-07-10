from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.security import check_permission
from app.models import Threat, User


async def load_threat(db: AsyncSession, threat_id: int) -> Threat | None:
    result = await db.execute(select(Threat).where(Threat.id == threat_id))
    return result.scalar_one_or_none()


async def assert_threat_readable(db: AsyncSession, *, threat_id: int, current_user: User) -> Threat:
    if not check_permission(current_user, "threats", "read"):
        raise AuthorizationError("Permission denied: threats:read")
    threat = await load_threat(db, threat_id)
    if not threat:
        raise NotFoundError("Threat not found")
    return threat


async def assert_threat_create_allowed(*, current_user: User) -> None:
    if not check_permission(current_user, "threats", "write"):
        raise AuthorizationError("Permission denied: threats:write")


async def assert_threat_update_allowed(db: AsyncSession, *, threat_id: int, current_user: User) -> Threat:
    if not check_permission(current_user, "threats", "write"):
        raise AuthorizationError("Permission denied: threats:write")
    threat = await load_threat(db, threat_id)
    if not threat:
        raise NotFoundError("Threat not found")
    if threat.is_archived:
        raise ConflictError("Cannot update archived threat")
    return threat


async def _assert_threat_delete_allowed(db: AsyncSession, *, threat_id: int, current_user: User) -> Threat:
    if not check_permission(current_user, "threats", "delete"):
        raise AuthorizationError("Permission denied: threats:delete")
    threat = await load_threat(db, threat_id)
    if not threat:
        raise NotFoundError("Threat not found")
    return threat


async def assert_threat_archive_allowed(db: AsyncSession, *, threat_id: int, current_user: User) -> Threat:
    threat = await _assert_threat_delete_allowed(db, threat_id=threat_id, current_user=current_user)
    if threat.is_archived:
        raise ValidationError("Threat is already archived")
    return threat


async def assert_threat_restore_allowed(db: AsyncSession, *, threat_id: int, current_user: User) -> Threat:
    threat = await _assert_threat_delete_allowed(db, threat_id=threat_id, current_user=current_user)
    if not threat.is_archived:
        raise ValidationError("Threat is not archived")
    return threat
