"""Directory user endpoints for AD Emulator."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

from app.db.session import get_db
from app.models.directory_user import DirectoryUser
from app.schemas.directory_user import (
    DirectoryUserCreate,
    DirectoryUserUpdate,
    DirectoryUserRead,
    DirectoryUserListResponse,
)
from app.services.webhook_service import dispatch_event

logger = logging.getLogger(__name__)

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("/", response_model=list[DirectoryUserRead])
async def list_directory_users(
    db: AsyncSession = Depends(get_db),
    email: str | None = None,
    department: str | None = None,
    active: bool | None = Query(None, description="Filter by account_enabled"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """
    List directory users with optional filters.
    
    This endpoint is called by RiskHub to fetch all users for sync.
    """
    query = select(DirectoryUser)
    
    if email:
        query = query.where(func.lower(DirectoryUser.email) == email.strip().lower())
    if department:
        query = query.where(func.lower(DirectoryUser.department) == department.strip().lower())
    if active is not None:
        query = query.where(DirectoryUser.account_enabled == active)
    
    query = query.order_by(DirectoryUser.display_name).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{external_id}", response_model=DirectoryUserRead)
async def get_directory_user(
    external_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a directory user by external_id."""
    result = await db.execute(
        select(DirectoryUser).where(DirectoryUser.external_id == external_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Directory user not found")
    return user


@router.post("/", response_model=DirectoryUserRead, status_code=status.HTTP_201_CREATED)
async def create_directory_user(
    payload: DirectoryUserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new directory user."""
    # Check external_id uniqueness
    existing = await db.execute(
        select(DirectoryUser).where(DirectoryUser.external_id == payload.external_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="external_id already exists")
    
    # Require at least email or UPN
    if not payload.email and not payload.user_principal_name:
        raise HTTPException(status_code=400, detail="email or user_principal_name is required")
    
    # Check email uniqueness if provided
    if payload.email:
        email_lower = payload.email.lower()
        email_existing = await db.execute(
            select(DirectoryUser).where(func.lower(DirectoryUser.email) == email_lower)
        )
        if email_existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="email already exists")
    
    # Hash password if provided
    password_hash = None
    if payload.password:
        password_hash = pwd_context.hash(payload.password)
    
    new_user = DirectoryUser(
        external_id=payload.external_id.strip(),
        user_principal_name=payload.user_principal_name.strip() if payload.user_principal_name else None,
        email=payload.email.lower() if payload.email else None,
        display_name=payload.display_name.strip(),
        given_name=payload.given_name.strip() if payload.given_name else None,
        surname=payload.surname.strip() if payload.surname else None,
        department=payload.department.strip() if payload.department else None,
        job_title=payload.job_title.strip() if payload.job_title else None,
        manager_external_id=payload.manager_external_id.strip() if payload.manager_external_id else None,
        account_enabled=payload.account_enabled,
        password_hash=password_hash,
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # Dispatch webhook for user creation
    try:
        await dispatch_event("user.created", new_user)
    except Exception as e:
        logger.error(f"Failed to dispatch webhook for user creation: {e}")
    
    return new_user


@router.patch("/{user_id}", response_model=DirectoryUserRead)
async def update_directory_user(
    user_id: int,
    payload: DirectoryUserUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a directory user."""
    result = await db.execute(
        select(DirectoryUser).where(DirectoryUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Directory user not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    
    # Handle email uniqueness
    if "email" in update_data and update_data["email"]:
        email_lower = update_data["email"].lower()
        update_data["email"] = email_lower
        email_existing = await db.execute(
            select(DirectoryUser).where(
                func.lower(DirectoryUser.email) == email_lower,
                DirectoryUser.id != user.id,
            )
        )
        if email_existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="email already exists")
    
    # Handle password update
    if "password" in update_data:
        if update_data["password"]:
            update_data["password_hash"] = pwd_context.hash(update_data["password"])
        del update_data["password"]
    
    # Strip string fields
    for key in ("user_principal_name", "display_name", "given_name", "surname", 
                "department", "job_title", "manager_external_id"):
        if key in update_data and update_data[key]:
            update_data[key] = update_data[key].strip()
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    await db.commit()
    await db.refresh(user)
    
    # Dispatch webhook for user update
    try:
        await dispatch_event("user.updated", user)
    except Exception as e:
        logger.error(f"Failed to dispatch webhook for user update: {e}")
    
    return user


@router.delete("/{user_id}", response_model=DirectoryUserRead)
async def deactivate_directory_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-delete a directory user by setting account_enabled=false.
    
    Like AD, we don't hard-delete users - we disable them.
    """
    result = await db.execute(
        select(DirectoryUser).where(DirectoryUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Directory user not found")
    
    user.account_enabled = False
    await db.commit()
    await db.refresh(user)
    
    # Dispatch webhook for user deactivation
    try:
        await dispatch_event("user.deactivated", user)
    except Exception as e:
        logger.error(f"Failed to dispatch webhook for user deactivation: {e}")
    
    return user


@router.post("/{user_id}/activate", response_model=DirectoryUserRead)
async def activate_directory_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Re-activate a disabled directory user."""
    result = await db.execute(
        select(DirectoryUser).where(DirectoryUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Directory user not found")
    
    user.account_enabled = True
    await db.commit()
    await db.refresh(user)
    
    # Dispatch webhook for user activation
    try:
        await dispatch_event("user.activated", user)
    except Exception as e:
        logger.error(f"Failed to dispatch webhook for user activation: {e}")
    
    return user
