from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import AuthorizationError, ValidationError
from app.models import Role, User
from app.models.user import AccessScope
from app.services._access_workflow import ADMIN_PRIVILEGED_ROLES
from app.services.directory_identity_service import requires_break_glass_for_reenable


def is_global_privileged_user(user: User) -> bool:
    return bool(user.role and user.role.name in ADMIN_PRIVILEGED_ROLES and user.access_scope == AccessScope.GLOBAL)


async def ensure_remaining_global_privileged_user(
    db: AsyncSession,
    *,
    user: User,
    detail: str,
    require_active: bool = True,
) -> None:
    query = (
        select(User.id)
        .join(Role)
        .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
        .where(User.id != user.id)
        .where(User.access_scope == AccessScope.GLOBAL)
        .limit(1)
    )
    if require_active:
        query = query.where(User.is_active.is_(True))

    remaining = await db.execute(query)
    if not remaining.scalar_one_or_none():
        raise ValidationError(detail)


def ensure_sso_local_field_update_allowed(
    *,
    settings: Settings,
    user: User,
    update_data: dict,
    fields: set[str],
) -> None:
    if settings.auth_mode != "microsoft_sso" or not user.external_id:
        return
    for field in fields:
        if field in update_data and update_data[field] != getattr(user, field):
            raise AuthorizationError(f"{field} is managed by directory sync for SSO-linked users.")


def ensure_directory_reenable_allowed(*, user: User, update_data: dict) -> None:
    if update_data.get("is_active") is True and requires_break_glass_for_reenable(user):
        raise AuthorizationError("Directory-deprovisioned users require break-glass enable before reactivation.")


async def ensure_role_change_keeps_privileged_access(
    db: AsyncSession,
    *,
    current_user: User,
    user: User,
    new_role: Role,
    require_active: bool = True,
) -> None:
    old_role_is_privileged = bool(user.role and user.role.name in ADMIN_PRIVILEGED_ROLES)
    new_role_is_privileged = new_role.name in ADMIN_PRIVILEGED_ROLES
    if current_user.id == user.id and old_role_is_privileged and not new_role_is_privileged:
        raise ValidationError("Cannot demote yourself from admin/CRO role")
    if old_role_is_privileged and not new_role_is_privileged and user.access_scope == AccessScope.GLOBAL:
        await ensure_remaining_global_privileged_user(
            db,
            user=user,
            detail="Cannot demote the last admin/CRO user",
            require_active=require_active,
        )
