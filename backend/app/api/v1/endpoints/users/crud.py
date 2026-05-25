from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.config import Settings, get_settings
from app.core.user_query_options import user_selectinload_options
from app.db.session import get_db
from app.models import User
from app.schemas import UserCreate, UserRead
from app.services._identity_access_lifecycle import create_user_profile

from ._lifecycle import ensure_admin_user_lifecycle

router = APIRouter()


@router.get("", response_model=list[UserRead])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    department_id: int | None = None,
    role_id: int | None = None,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List users with filtering (admin-only).

    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        department_id: Optional filter by department
        role_id: Optional filter by role
        current_user: Authenticated user
        db: Database session

    Returns:
        List of users

    Raises:
        HTTPException: If user doesn't have permission
    """
    ensure_admin_user_lifecycle(current_user)

    query = select(User).options(*user_selectinload_options())

    if department_id:
        query = query.where(User.department_id == department_id)
    if role_id:
        query = query.where(User.role_id == role_id)

    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()


@router.post("", response_model=UserRead, status_code=201)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Create new user (admin-only).

    Args:
        user_data: User creation data
        current_user: Authenticated user
        db: Database session

    Returns:
        Created user

    Raises:
        HTTPException: If user doesn't have permission or email exists
    """
    ensure_admin_user_lifecycle(current_user)
    return await create_user_profile(
        db=db,
        settings=settings,
        current_user=current_user,
        user_data=user_data,
    )
