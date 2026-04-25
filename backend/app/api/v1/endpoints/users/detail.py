from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.config import Settings, get_settings
from app.core.email import email_equals
from app.core.security import get_password_hash
from app.core.user_query_options import user_selectinload_options
from app.db.session import get_db
from app.models import Role, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.role import RoleType
from app.models.user import AccessScope
from app.schemas import UserRead, UserUpdate
from app.services.directory_identity_service import requires_break_glass_for_reenable
from app.services.orphaned_item_service import OrphanedItemService

from ._lifecycle import require_admin_user_lifecycle

router = APIRouter()
ADMIN_PRIVILEGED_ROLES: set[RoleType] = {RoleType.ADMIN, RoleType.CRO}


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user by ID.

    Args:
        user_id: User ID
        current_user: Authenticated user
        db: Database session

    Returns:
        User details

    Raises:
        HTTPException: If user doesn't have permission or user not found
    """
    require_admin_user_lifecycle(current_user)

    result = await db.execute(select(User).options(*user_selectinload_options()).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Update user (admin-only).

    Args:
        user_id: User ID
        user_data: User update data
        current_user: Authenticated user
        db: Database session

    Returns:
        Updated user

    Raises:
        HTTPException: If user doesn't have permission or user not found
    """
    require_admin_user_lifecycle(current_user)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check email uniqueness if changing email
    if user_data.email and user_data.email != user.email:
        email_check = await db.execute(select(User).where(email_equals(User.email, user_data.email)))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

    # Update fields
    update_data = user_data.model_dump(exclude_unset=True)
    password_field_provided = "password" in update_data  # gitleaks:allow
    password = update_data.pop("password", None)  # gitleaks:allow

    if settings.auth_mode == "microsoft_sso" and password_field_provided:
        raise HTTPException(
            status_code=403,
            detail="Password updates are disabled in microsoft_sso mode.",
        )

    if settings.auth_mode == "microsoft_sso" and user.external_id:
        locked_identity_fields = {"email", "name", "department_id"}
        for field in locked_identity_fields:
            if field in update_data and update_data[field] != getattr(user, field):
                raise HTTPException(
                    status_code=403,
                    detail=f"{field} is managed by directory sync for SSO-linked users.",
                )

    if update_data.get("is_active") is True and requires_break_glass_for_reenable(user):
        raise HTTPException(
            status_code=403,
            detail="Directory-deprovisioned users require break-glass enable before reactivation.",
        )

    if "role_id" in update_data:
        new_role_id = update_data["role_id"]
        if new_role_id != user.role_id:
            new_role_result = await db.execute(select(Role).where(Role.id == new_role_id))
            new_role = new_role_result.scalar_one_or_none()
            if not new_role:
                raise HTTPException(status_code=400, detail="Invalid role_id")

            old_role_is_privileged = bool(user.role and user.role.name in ADMIN_PRIVILEGED_ROLES)
            new_role_is_privileged = new_role.name in ADMIN_PRIVILEGED_ROLES

            if current_user.id == user.id and old_role_is_privileged and not new_role_is_privileged:
                raise HTTPException(status_code=400, detail="Cannot demote yourself from admin/CRO role")

            if old_role_is_privileged and not new_role_is_privileged and user.access_scope == AccessScope.GLOBAL:
                remaining = await db.execute(
                    select(User.id)
                    .join(Role)
                    .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
                    .where(User.id != user.id)
                    .where(User.access_scope == AccessScope.GLOBAL)
                    .where(User.is_active.is_(True))
                    .limit(1)
                )
                if not remaining.scalar_one_or_none():
                    raise HTTPException(status_code=400, detail="Cannot demote the last admin/CRO user")

    extra_changes: dict[str, dict[str, object]] = {}
    if password is not None:
        user.hashed_password = get_password_hash(password)
        extra_changes["password_changed"] = {"old": None, "new": True}

    is_deactivating = user.is_active is True and update_data.get("is_active") is False
    is_privileged_user = bool(
        user.role
        and user.role.name in ADMIN_PRIVILEGED_ROLES
        and user.access_scope == AccessScope.GLOBAL
    )
    if is_deactivating and current_user.id == user.id and is_privileged_user:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own privileged access")
    if is_deactivating and is_privileged_user:
        remaining = await db.execute(
            select(User.id)
            .join(Role)
            .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
            .where(User.id != user.id)
            .where(User.access_scope == AccessScope.GLOBAL)
            .where(User.is_active.is_(True))
            .limit(1)
        )
        if not remaining.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Cannot deactivate the last admin/CRO user")
    if is_deactivating:
        try:
            created_orphans = await OrphanedItemService.flag_orphaned_items(db, user.id)
        except Exception:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Failed to flag orphaned items")
        extra_changes["orphaned_items_flagged"] = {"old": None, "new": len(created_orphans)}

    changes = build_change_set(user, update_data, extra_changes=extra_changes)

    for field, value in update_data.items():
        setattr(user, field, value)

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=user.department_id,
        changes=changes,
        description="Password updated" if password is not None and not update_data else None,
    )
    await db.commit()
    await db.refresh(user)

    # Reload with all relationships
    result = await db.execute(select(User).options(*user_selectinload_options()).where(User.id == user.id))
    return result.scalar_one()
