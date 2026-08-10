from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.security import check_permission
from app.models import Role, Threat, User
from app.models.role import RoleType
from app.services._threat_stewardship_lock import acquire_threat_steward_identity_lock


async def load_threat(
    db: AsyncSession,
    threat_id: int,
    *,
    for_update: bool = False,
) -> Threat | None:
    statement = (
        select(Threat)
        .options(
            selectinload(Threat.threat_steward).selectinload(User.role),
            selectinload(Threat.threat_steward).selectinload(User.department),
        )
        .where(Threat.id == threat_id)
    )
    if for_update:
        statement = statement.with_for_update()
    result = await db.execute(statement)
    return result.scalar_one_or_none()


async def assert_active_ciso_steward(
    db: AsyncSession,
    *,
    user_id: int,
    acquire_identity_lock: bool = True,
) -> User:
    if acquire_identity_lock:
        await acquire_threat_steward_identity_lock(db, user_id=user_id)
    steward_state = (
        await db.execute(
            select(
                User.is_active.label("user_is_active"),
                Role.is_active.label("role_is_active"),
                Role.name,
            )
            .join(Role, Role.id == User.role_id)
            .where(User.id == user_id)
        )
    ).one_or_none()
    if (
        steward_state is None
        or not steward_state.user_is_active
        or not steward_state.role_is_active
        or steward_state.name != RoleType.CISO
    ):
        raise ValidationError("Threat steward must be an active CISO")

    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user_id)
    )
    return result.scalar_one()


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


async def assert_threat_update_allowed(
    db: AsyncSession,
    *,
    threat_id: int,
    current_user: User,
    for_update: bool = False,
) -> Threat:
    if not check_permission(current_user, "threats", "write"):
        raise AuthorizationError("Permission denied: threats:write")
    threat = await load_threat(db, threat_id, for_update=for_update)
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
