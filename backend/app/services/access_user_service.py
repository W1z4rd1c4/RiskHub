from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.config import Settings
from app.core.email import email_equals
from app.core.user_query_options import user_selectinload_options
from app.models import Role, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.role import RoleType
from app.models.user import AccessScope
from app.services.directory_identity_service import requires_break_glass_for_reenable

ADMIN_PRIVILEGED_ROLES: set[RoleType] = {RoleType.ADMIN, RoleType.CRO}
PLATFORM_ADMIN_FIELDS = {"name", "email"}
BUSINESS_ACCESS_FIELDS = {"department_id", "manager_id", "access_scope"}


def _is_platform_admin(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.ADMIN)


def _is_cro(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.CRO)


async def _get_role_or_400(db: AsyncSession, role_id: int) -> Role:
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role_id")
    return role


async def _authorize_access_update_fields(
    *,
    db: AsyncSession,
    current_user: User,
    target_user: User,
    update_data: dict,
) -> Role | None:
    if _is_platform_admin(target_user) and not _is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    platform_update = {field: value for field, value in update_data.items() if field in PLATFORM_ADMIN_FIELDS}
    business_update = {field: value for field, value in update_data.items() if field in BUSINESS_ACCESS_FIELDS}
    new_role: Role | None = None

    if platform_update and not _is_platform_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin can update user identity fields",
        )

    if business_update and not _is_cro(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only CRO can update user business access fields",
        )

    if "role_id" not in update_data or update_data["role_id"] == target_user.role_id:
        return None

    new_role = await _get_role_or_400(db, update_data["role_id"])
    assigning_admin = new_role.name == RoleType.ADMIN

    if assigning_admin and not _is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin can assign the Admin role")
    if not assigning_admin and not _is_cro(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only CRO can assign business roles")

    return new_role


async def update_access_user_settings(
    *,
    db: AsyncSession,
    settings: Settings,
    current_user: User,
    user_id: int,
    update_data: dict,
) -> User:
    result = await db.execute(
        select(User).options(*user_selectinload_options(include_permissions=True)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if _is_platform_admin(user) and not _is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    platform_update = {field: value for field, value in update_data.items() if field in PLATFORM_ADMIN_FIELDS}
    new_role = await _authorize_access_update_fields(
        db=db,
        current_user=current_user,
        target_user=user,
        update_data=update_data,
    )

    if settings.auth_mode == "microsoft_sso" and user.external_id:
        for field, value in platform_update.items():
            if value != getattr(user, field):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"{field} is managed by directory sync for SSO-linked users.",
                )

    if update_data.get("is_active") is True and requires_break_glass_for_reenable(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Directory-deprovisioned users require break-glass enable before reactivation.",
        )

    if "email" in platform_update and platform_update["email"] != user.email:
        email_check = await db.execute(
            select(User.id).where(email_equals(User.email, platform_update["email"])).where(User.id != user.id).limit(1)
        )
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if new_role is not None:
        old_role_is_privileged = user.role and user.role.name in ADMIN_PRIVILEGED_ROLES
        new_role_is_privileged = new_role.name in ADMIN_PRIVILEGED_ROLES

        if current_user.id == user.id and old_role_is_privileged and not new_role_is_privileged:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote yourself from admin/CRO role"
            )

        if old_role_is_privileged and not new_role_is_privileged:
            remaining = await db.execute(
                select(User.id)
                .join(Role)
                .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
                .where(User.id != user.id)
                .where(User.access_scope == AccessScope.GLOBAL)
                .limit(1)
            )
            if not remaining.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote the last admin/CRO user"
                )

    if "access_scope" in update_data:
        new_scope = AccessScope(update_data["access_scope"])
        update_data["access_scope"] = new_scope

        if current_user.id == user.id and new_scope != AccessScope.GLOBAL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own privileged access",
            )

        if (
            user.role
            and user.role.name in ADMIN_PRIVILEGED_ROLES
            and user.access_scope == AccessScope.GLOBAL
            and new_scope != AccessScope.GLOBAL
        ):
            remaining = await db.execute(
                select(User.id)
                .join(Role)
                .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
                .where(User.id != user.id)
                .where(User.access_scope == AccessScope.GLOBAL)
                .limit(1)
            )
            if not remaining.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove the last admin/CRO from privileged access",
                )

    changes = build_change_set(user, update_data)

    for field, value in update_data.items():
        setattr(user, field, value)

    if changes:
        await log_activity(
            db,
            entity_type=ActivityEntityType.USER,
            entity_id=user.id,
            entity_name=user.name,
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=user.department_id,
            changes=changes,
        )

    await db.commit()
    await db.refresh(user)

    result = await db.execute(
        select(User).options(*user_selectinload_options(include_permissions=True)).where(User.id == user.id)
    )
    return result.scalar_one()
