from typing import Optional
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, Header, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.db.session import get_db
from app.models import User, Role, RolePermission
from app.core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# Password hashing utilities
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


# JWT token utilities
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a JWT access token.
    
    Args:
        data: Dictionary of claims to encode in the token
        expires_delta: Optional expiration time delta
        
    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT access token.
    
    Args:
        token: JWT token string
        
    Returns:
        Dictionary of decoded claims
        
    Raises:
        JWTError: If token is invalid or expired
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    x_mock_user_id: Optional[int] = Header(None, alias="X-Mock-User-Id"),
) -> User:
    """
    Get the current user - mocked for now, will integrate with Azure AD later.
    
    In development, uses X-Mock-User-Id header to simulate different users.
    In production, this will validate Azure AD tokens.
    """
    # Eager load role -> permissions -> permission
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    
    if x_mock_user_id:
        # Mock auth: get user by ID from header
        result = await db.execute(
            select(User)
            .options(permission_load)
            .where(User.id == x_mock_user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            return user
    
    # Default: return first admin user for development
    result = await db.execute(
        select(User)
        .options(permission_load)
        .join(User.role)
        .where(Role.name == "admin")
        .limit(1)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authenticated user found",
        )
    
    return user


def check_permission(user: User, resource: str, action: str) -> bool:
    """Check if user has permission for a resource/action combination."""
    if not user.role or not user.role.permissions:
        return False
    
    for role_perm in user.role.permissions:
        perm = role_perm.permission
        if perm.resource == resource and perm.action == action:
            return True
        # Wildcard permissions
        if perm.resource == "*" or perm.action == "*":
            if perm.resource == "*" and perm.action == action:
                return True
            if perm.action == "*" and perm.resource == resource:
                return True
            if perm.resource == "*" and perm.action == "*":
                return True
    
    return False


def require_permission(resource: str, action: str):
    """FastAPI dependency factory for requiring specific permissions."""
    async def permission_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if not check_permission(current_user, resource, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {resource}:{action}",
            )
        return current_user
    
    return permission_checker
