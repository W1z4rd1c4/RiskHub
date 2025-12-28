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
from app.api import deps

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
    # Eager load role and permissions
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    
    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(User.email == credentials.email)
    )
    user = result.scalar_one_or_none()
    
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    
    # Build user response
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name,
        "role_display_name": user.role.display_name,
        "department_id": user.department_id,
        "department_name": user.department.name if user.department else None,
        "permissions": [f"{rp.permission.resource}:{rp.permission.action}" 
                       for rp in user.role.permissions]
    }
    
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
    
    return UserBrief(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role.name,
        role_display_name=current_user.role.display_name,
        permissions=[f"{rp.permission.resource}:{rp.permission.action}" for rp in current_user.role.permissions],
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
    
    # Build user response
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name,
        "role_display_name": user.role.display_name,
        "department_id": user.department_id,
        "department_name": user.department.name if user.department else None,
        "permissions": [f"{rp.permission.resource}:{rp.permission.action}" 
                       for rp in user.role.permissions]
    }
    
    return TokenResponse(access_token=access_token, user=user_data)

