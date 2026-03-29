from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.config import Settings, get_settings
from app.core.security import get_password_hash
from app.core.user_query_options import user_selectinload_options
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas import UserRead, UserUpdate
from app.services.orphaned_item_service import OrphanedItemService

from ._lifecycle import require_admin_user_lifecycle

router = APIRouter()


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
        email_check = await db.execute(select(User).where(User.email == user_data.email))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

    # Update fields
    update_data = user_data.model_dump(exclude_unset=True)
    password_field_provided = "password" in update_data
    password = update_data.pop("password", None)

    if settings.auth_mode == "microsoft_sso" and password_field_provided:
        raise HTTPException(
            status_code=403,
            detail="Password updates are disabled in microsoft_sso mode.",
        )

    extra_changes = {}
    if password is not None:
        user.hashed_password = get_password_hash(password)
        extra_changes["password_changed"] = {"old": None, "new": True}

    is_deactivating = user.is_active is True and update_data.get("is_active") is False
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
