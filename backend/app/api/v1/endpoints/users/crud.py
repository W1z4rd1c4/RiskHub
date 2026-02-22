from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.activity_logger import log_activity
from app.core.config import Settings, get_settings
from app.core.permissions import can_manage_users
from app.core.security import get_password_hash
from app.core.user_query_options import user_selectinload_options
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas import UserCreate, UserRead

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
    if not can_manage_users(current_user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

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
    if not can_manage_users(current_user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if settings.auth_mode == "microsoft_sso":
        raise HTTPException(
            status_code=403,
            detail="Manual user creation is disabled in microsoft_sso mode. Use /api/v1/directory/users/{oid}/import.",
        )

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        role_id=user_data.role_id,
        department_id=user_data.department_id,
        manager_id=user_data.manager_id,
        is_active=user_data.is_active,
        hashed_password=get_password_hash(user_data.password),
    )

    db.add(new_user)
    await db.flush()

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.USER,
        entity_id=new_user.id,
        entity_name=new_user.name,
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=new_user.department_id,
    )
    await db.commit()
    await db.refresh(new_user)

    # Reload with all relationships to ensure they are available for schema validation
    # This prevents MissingGreenlet errors in async context
    result = await db.execute(select(User).options(*user_selectinload_options()).where(User.id == new_user.id))
    return result.scalar_one()
