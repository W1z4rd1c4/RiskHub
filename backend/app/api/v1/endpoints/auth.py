"""Authentication endpoints for login, logout, and current user."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserRead, UserBrief
from app.models import User, Role, RolePermission
from app.core.security import verify_password, create_access_token
from app.core.permissions import get_effective_permissions, get_scope_label
from app.api import deps
from app.middleware.security import account_lockout

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Authenticate user and return JWT token.
    
    Args:
        credentials: Email and password
        db: Database session
        
    Returns:
        JWT access token and user information
        
    Raises:
        HTTPException: If credentials are invalid or user is inactive
    """
    # Check if account is locked due to too many failed attempts
    is_locked, lockout_remaining = account_lockout.is_locked(credentials.email)
    if is_locked:
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {lockout_remaining} seconds.",
            headers={"Retry-After": str(lockout_remaining)}
        )
    
    # Eager load role and permissions
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    
    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(User.email == credentials.email)
    )
    user = result.scalar_one_or_none()
    
    if not user or not user.hashed_password:
        # Track failed attempt
        is_now_locked, info = account_lockout.record_failed_attempt(credentials.email)
        
        from app.core.activity_logger import log_activity
        from app.models.activity_log import ActivityAction, ActivityEntityType
        await log_activity(
            db=db,
            actor=None,
            action=ActivityAction.FAILED_LOGIN,
            entity_type=ActivityEntityType.USER,
            entity_id=0,
            entity_name=credentials.email,
            description=f"Failed login attempt: invalid credentials{' (account now locked)' if is_now_locked else ''}"
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user.hashed_password):
        # Track failed attempt
        is_now_locked, info = account_lockout.record_failed_attempt(credentials.email)
        
        from app.core.activity_logger import log_activity
        from app.models.activity_log import ActivityAction, ActivityEntityType
        await log_activity(
            db=db,
            actor=None,  # Don't attribute to user to avoid confirming existence
            action=ActivityAction.FAILED_LOGIN,
            entity_type=ActivityEntityType.USER,
            entity_id=0,  # Don't expose real user ID
            entity_name=credentials.email,
            description=f"Failed login attempt: invalid credentials{' (account now locked)' if is_now_locked else ''}"
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    
    effective_permissions = get_effective_permissions(user)
    scope_label = get_scope_label(user)
    # Build user response
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name,
        "role_display_name": user.role.display_name,
        "department_id": user.department_id,
        "department_name": user.department.name if user.department else None,
        "permissions": effective_permissions,
        "effective_permissions": effective_permissions,
        "access_scope": user.access_scope,
        "scope_label": scope_label,
    }
    
    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    # Clear any failed login attempts on successful authentication
    account_lockout.record_successful_login(credentials.email)
    
    # Log successful login
    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        description=f"User logged in: {user.email}"
    )
    
    await db.commit()
    
    return TokenResponse(access_token=access_token, user=user_data)


@router.get("/me", response_model=UserBrief)
async def get_current_user_info(current_user: User = Depends(deps.get_current_user)):
    """
    Get current authenticated user information.
    
    Args:
        current_user: Authenticated user from JWT token
        
    Returns:
        Current user details
    """
    # Ensure relationships are loaded if they weren't (though deps usually loads them)
    # The permissions are needed for the response
    
    effective_permissions = get_effective_permissions(current_user)
    return UserBrief(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role.name,
        role_display_name=current_user.role.display_name,
        permissions=effective_permissions,
        effective_permissions=effective_permissions,
        access_scope=current_user.access_scope,
        scope_label=get_scope_label(current_user),
        department_id=current_user.department_id,
        department_name=current_user.department.name if current_user.department else None
    )


@router.post("/logout")
async def logout():
    """
    Logout endpoint (client-side token removal).
    
    Returns:
        Success message
    """
    return {"message": "Logged out successfully"}


@router.post("/demo-login/{user_id}", response_model=TokenResponse)
async def demo_login(user_id: int, db: AsyncSession = Depends(get_db)):
    """
    Demo login endpoint - allows direct login by user ID.
    ONLY works in development mode with mock auth enabled.
    
    Args:
        user_id: The ID of the demo user to log in as
        db: Database session
        
    Returns:
        JWT access token and user information
    """
    from app.core.config import get_settings
    
    settings = get_settings()
    
    # Security check - only allow in demo/debug mode
    if not settings.debug or not settings.mock_auth_enabled:
        raise HTTPException(
            status_code=403, 
            detail="Demo login is only available in development mode"
        )
    
    # Eager load role and permissions
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    
    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Demo user not found")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    
    effective_permissions = get_effective_permissions(user)
    scope_label = get_scope_label(user)
    # Build user response
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name,
        "role_display_name": user.role.display_name,
        "department_id": user.department_id,
        "department_name": user.department.name if user.department else None,
        "permissions": effective_permissions,
        "effective_permissions": effective_permissions,
        "access_scope": user.access_scope,
        "scope_label": scope_label,
    }

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    # Log successful demo login
    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        description=f"User logged in (demo): {user.email}"
    )
    
    await db.commit()
    
    return TokenResponse(access_token=access_token, user=user_data)
