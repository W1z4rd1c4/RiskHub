"""Role configuration policy and serialization helpers."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.policy import PROTECTED_SYSTEM_ROLES
from app.models.role import Permission, Role, RolePermission, RoleType
from app.schemas.riskhub import RoleHubCapabilities, RoleHubRead


IMMUTABLE_ROLE_NAMES = {RoleType.CRO, RoleType.ADMIN, RoleType.VIEWER}


def role_capabilities(role: Role, *, active_user_count: int | None = None) -> RoleHubCapabilities:
    active_users = active_user_count if active_user_count is not None else len([user for user in role.users if user.is_active])
    protected = role.is_system or role.name in PROTECTED_SYSTEM_ROLES
    mutable = role.name not in IMMUTABLE_ROLE_NAMES
    return RoleHubCapabilities(
        can_update=bool(mutable),
        can_delete=bool(role.is_active and not protected and active_users == 0),
        can_restore=bool(not role.is_active),
    )


def role_to_read(role: Role, *, user_count: int | None = None) -> RoleHubRead:
    active_user_count = user_count if user_count is not None else len([user for user in role.users if user.is_active])
    return RoleHubRead(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        user_count=active_user_count,
        permissions=[f"{rp.permission.resource}:{rp.permission.action}" for rp in role.permissions],
        capabilities=role_capabilities(role, active_user_count=active_user_count),
    )


async def load_role_for_update(db: AsyncSession, role_id: int) -> Role:
    result = await db.execute(
        select(Role)
        .options(
            selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(Role.users),
        )
        .where(Role.id == role_id)
        .with_for_update()
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


async def validate_permission_ids(db: AsyncSession, permission_ids: list[int]) -> list[Permission]:
    if not permission_ids:
        return []
    perms_result = await db.execute(select(Permission).where(Permission.id.in_(permission_ids)))
    permissions = perms_result.scalars().all()
    found_ids = {permission.id for permission in permissions}
    missing_ids = set(permission_ids) - found_ids
    if missing_ids:
        raise HTTPException(status_code=400, detail=f"Unknown permission IDs: {sorted(missing_ids)}")
    return permissions
