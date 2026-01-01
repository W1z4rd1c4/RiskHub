"""User management endpoints with RBAC."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, Role
from app.schemas import RoleRead, UserRead, UserBrief, UserCreate, UserUpdate
from app.schemas.user import UserLookup
from app.core.security import get_password_hash
from app.core.permissions import can_manage_users
from app.api import deps
from app.core.activity_logger import log_activity
from app.models.activity_log import ActivityAction, ActivityEntityType

router = APIRouter()


@router.get("", response_model=list[UserRead])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
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
    await db.refresh(new_user)
    
    # Reload with all relationships to ensure they are available for schema validation
    # This prevents MissingGreenlet errors in async context
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.role),
            selectinload(User.department),
            selectinload(User.manager)
        )
        .where(User.id == new_user.id)
    )
    return result.scalar_one()


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List all available roles. Requires authentication."""
    result = await db.execute(select(Role))
    return result.scalars().all()


@router.get("/lookup", response_model=list[UserLookup])
async def lookup_users(
    q: str | None = None,
    include_inactive: bool = False,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Scoped user lookup for pickers/dropdowns.
    
    Returns users visible to the current user based on their access scope:
    - GLOBAL: All active users
    - DEPARTMENT: Same-department users
    - MANAGER: Self + direct reports
    
    Args:
        q: Optional text search (name or email)
        include_inactive: Include inactive users (default False)
    """
    from app.models.user import AccessScope
    from sqlalchemy import or_
    
    query = select(User).options(
        selectinload(User.role),
        selectinload(User.department),
    )
    
    # Apply scope filtering based on current user's access
    if current_user.access_scope == AccessScope.GLOBAL:
        # Global users see everyone
        pass
    elif current_user.access_scope == AccessScope.DEPARTMENT:
        # Department scope: same department users
        if current_user.department_id:
            query = query.where(User.department_id == current_user.department_id)
        else:
            # No department, only see self
            query = query.where(User.id == current_user.id)
    else:
        # Manager scope: self + direct reports
        query = query.where(
            or_(
                User.id == current_user.id,
                User.manager_id == current_user.id
            )
        )
    
    # Apply active filter
    if not include_inactive:
        query = query.where(User.is_active == True)
    
    # Apply text search
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                User.name.ilike(search_term),
                User.email.ilike(search_term)
            )
        )
    
    result = await db.execute(query.limit(100))
    users = result.scalars().all()
    
    return [
        UserLookup(
            id=u.id,
            name=u.name,
            email=u.email,
            role_name=u.role.name if u.role else None,
            department_id=u.department_id,
            department_name=u.department.name if u.department else None,
            manager_id=u.manager_id,
        )
        for u in users
    ]


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


@router.patch("/{user_id}", response_model=UserRead)
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
    
    # Check email uniqueness if changing email
    if user_data.email and user_data.email != user.email:
        email_check = await db.execute(
            select(User).where(User.email == user_data.email)
        )
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

    # Update fields
    update_data = user_data.model_dump(exclude_unset=True)
    
    # Handle password hashing
    if "password" in update_data:
        password = update_data.pop("password")
        user.hashed_password = get_password_hash(password)
        
    for field, value in update_data.items():
        setattr(user, field, value)
    
    await db.commit()
    await db.refresh(user)
    
    # Reload with all relationships
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.role),
            selectinload(User.department),
            selectinload(User.manager)
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


@router.get("/{user_id}/subordinates", response_model=list[UserRead])
async def get_user_subordinates(
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all direct subordinates of a user.
    Requires: admin/manager access OR self-lookup.
    """
    from app.core.permissions import can_manage_users
    
    # Allow self-lookup or admin/manager access
    if current_user.id != user_id and not can_manage_users(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - can only view own subordinates or requires admin access"
        )
    
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.subordinates).options(
                 selectinload(User.role),
                 selectinload(User.department),
                 selectinload(User.manager)
            )
        )
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user.subordinates




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
    import os
    if os.getenv("MOCK_AUTH_ENABLED", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Mock auth not enabled")

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
