"""Access-management policy helpers shared by API and service code."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Role, User
from app.models.role import RoleType
from app.schemas.access import AccessUserCapabilities

ADMIN_PRIVILEGED_ROLES: set[RoleType] = {RoleType.ADMIN, RoleType.CRO}
PLATFORM_ADMIN_FIELDS = {"name", "email"}
BUSINESS_ACCESS_FIELDS = {"department_id", "manager_id", "access_scope"}


def is_platform_admin(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.ADMIN)


def is_cro(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.CRO)


def access_user_capabilities(current_user: User, target_user: User) -> AccessUserCapabilities:
    target_is_admin = is_platform_admin(target_user)
    current_is_admin = is_platform_admin(current_user)
    current_is_cro = is_cro(current_user)
    hidden_from_current = target_is_admin and not current_is_admin
    return AccessUserCapabilities(
        can_edit_identity=bool(current_is_admin and not hidden_from_current),
        can_edit_business_access=bool(current_is_cro and not hidden_from_current),
        can_edit_role=bool((current_is_admin or current_is_cro) and not hidden_from_current),
        can_deactivate=bool((current_is_admin or current_is_cro) and current_user.id != target_user.id and not hidden_from_current),
        can_revoke_sessions=bool(current_is_admin and current_user.id != target_user.id and not hidden_from_current),
    )


async def _get_role_or_400(db: AsyncSession, role_id: int) -> Role:
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role_id")
    return role


async def authorize_access_update_fields(
    *,
    db: AsyncSession,
    current_user: User,
    target_user: User,
    update_data: dict,
) -> Role | None:
    if is_platform_admin(target_user) and not is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    platform_update = {field: value for field, value in update_data.items() if field in PLATFORM_ADMIN_FIELDS}
    business_update = {field: value for field, value in update_data.items() if field in BUSINESS_ACCESS_FIELDS}
    new_role: Role | None = None

    if platform_update and not is_platform_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin can update user identity fields",
        )

    if business_update and not is_cro(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only CRO can update user business access fields",
        )

    if "role_id" not in update_data or update_data["role_id"] == target_user.role_id:
        return None

    new_role = await _get_role_or_400(db, update_data["role_id"])
    assigning_admin = new_role.name == RoleType.ADMIN

    if assigning_admin and not is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin can assign the Admin role")
    if not assigning_admin and not is_cro(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only CRO can assign business roles")

    return new_role
