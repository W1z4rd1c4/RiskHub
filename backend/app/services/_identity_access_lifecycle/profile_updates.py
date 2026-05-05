from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set
from app.core.config import Settings
from app.core.email import email_equals
from app.core.security import get_password_hash
from app.models import Role, User
from app.schemas import UserUpdate
from app.services.orphaned_item_service import OrphanedItemService

from .execution import log_user_update_and_commit
from .policy import (
    ensure_directory_reenable_allowed,
    ensure_remaining_global_privileged_user,
    ensure_role_change_keeps_privileged_access,
    ensure_sso_local_field_update_allowed,
    is_global_privileged_user,
)


async def flag_orphaned_items_for_deactivation(db: AsyncSession, *, user: User) -> int:
    try:
        created_orphans = await OrphanedItemService.flag_orphaned_items(db, user.id)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to flag orphaned items") from exc
    return len(created_orphans)


async def update_user_profile(
    *,
    db: AsyncSession,
    settings: Settings,
    current_user: User,
    user_id: int,
    user_data: UserUpdate,
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_data.email and user_data.email != user.email:
        email_check = await db.execute(select(User).where(email_equals(User.email, user_data.email)))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    update_data = user_data.model_dump(exclude_unset=True)
    password_field_provided = "password" in update_data  # gitleaks:allow
    password = update_data.pop("password", None)  # gitleaks:allow

    if settings.auth_mode == "microsoft_sso" and password_field_provided:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password updates are disabled in microsoft_sso mode.",
        )

    ensure_sso_local_field_update_allowed(
        settings=settings,
        user=user,
        update_data=update_data,
        fields={"email", "name", "department_id"},
    )
    ensure_directory_reenable_allowed(user=user, update_data=update_data)

    if "role_id" in update_data:
        new_role_id = update_data["role_id"]
        if new_role_id != user.role_id:
            new_role = (await db.execute(select(Role).where(Role.id == new_role_id))).scalar_one_or_none()
            if not new_role:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role_id")
            await ensure_role_change_keeps_privileged_access(db, current_user=current_user, user=user, new_role=new_role)

    extra_changes: dict[str, dict[str, object]] = {}
    if password is not None:
        user.hashed_password = get_password_hash(password)
        extra_changes["password_changed"] = {"old": None, "new": True}

    is_deactivating = user.is_active is True and update_data.get("is_active") is False
    if is_deactivating and current_user.id == user.id and is_global_privileged_user(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own privileged access")
    if is_deactivating and is_global_privileged_user(user):
        await ensure_remaining_global_privileged_user(
            db,
            user=user,
            detail="Cannot deactivate the last admin/CRO user",
        )
    if is_deactivating:
        orphan_count = await flag_orphaned_items_for_deactivation(db, user=user)
        extra_changes["orphaned_items_flagged"] = {"old": None, "new": orphan_count}

    changes = build_change_set(user, update_data, extra_changes=extra_changes)
    for field, value in update_data.items():
        setattr(user, field, value)

    return await log_user_update_and_commit(
        db=db,
        user=user,
        current_user=current_user,
        changes=changes,
        description="Password updated" if password is not None and not update_data else None,
        log_when_empty=True,
    )
