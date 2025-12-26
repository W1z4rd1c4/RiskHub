"""User management endpoints with RBAC."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, Role
from app.schemas import RoleRead, UserRead, UserBrief, UserCreate, UserUpdate
from app.core.security import get_password_hash
from app.core.permissions import can_manage_users
from app.api import deps

router = APIRouter()


@router.get("", response_model=list[UserRead])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    department_id: int | None = None,
    role_id: int | None = None,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
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
    
    query = select(User).options(
        selectinload(User.role),
        selectinload(User.department),
        selectinload(User.manager)
    )
    
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
    db: AsyncSession = Depends(get_db)
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
    
    # Check if email already exists
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
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
        hashed_password=get_password_hash(user_data.password)
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user, ["role", "department", "manager"])
    
    return new_user


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
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
    if not can_manage_users(current_user) and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.role),
            selectinload(User.department),
            selectinload(User.manager)
        )
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
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
    if not can_manage_users(current_user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    for field, value in user_data.dict(exclude_unset=True).items():
        setattr(user, field, value)
    
    await db.commit()
    await db.refresh(user, ["role", "department", "manager"])
    
    return user


@router.get("/{user_id}/subordinates", response_model=list[UserRead])
async def get_user_subordinates(
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all direct subordinates of a user.
    
    Args:
        user_id: User ID
        current_user: Authenticated user
        db: Database session
        
    Returns:
        List of subordinate users
        
    Raises:
        HTTPException: If user not found
    """
    result = await db.execute(
        select(User)
        .options(selectinload(User.subordinates))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user.subordinates


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
):
    """List all available roles."""
    result = await db.execute(select(Role))
    return result.scalars().all()


# Keep mock login for development
@router.post("/mock-login/{user_id}")
async def mock_login(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Mock login endpoint for development.
    Returns user info that can be used with X-Mock-User-Id header.
    """
    result = await db.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return {"error": "User not found"}
    
    return {
        "message": f"Mock login successful. Use header: X-Mock-User-Id: {user_id}",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.name if user.role else None,
        }
    }
