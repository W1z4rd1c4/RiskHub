from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.config import Settings, get_settings
from app.core.user_query_options import user_selectinload_options
from app.db.session import get_db
from app.models import User
from app.schemas import UserRead, UserUpdate
from app.services._identity_access_lifecycle import update_user_profile

from ._lifecycle import ensure_admin_user_lifecycle

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
    ensure_admin_user_lifecycle(current_user)

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
    ensure_admin_user_lifecycle(current_user)

    return await update_user_profile(
        db=db,
        settings=settings,
        current_user=current_user,
        user_id=user_id,
        user_data=user_data,
    )
