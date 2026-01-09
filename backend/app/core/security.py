from typing import Optional
import os
import logging
from datetime import datetime, timedelta, UTC
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
logger = logging.getLogger(__name__)


def _is_production_environment() -> bool:
    """Detect if running in production environment."""
    env = os.getenv("ENV", "").lower()
    debug = os.getenv("DEBUG", "false").lower()
    return env == "production" or debug == "false"


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
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")


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
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    x_mock_user_id: Optional[int] = Header(None, alias="X-Mock-User-Id"),
) -> User:
    """
    Get the current user - mocked for development only.
    
    In development with MOCK_AUTH_ENABLED=true, uses X-Mock-User-Id header.
    In production, this endpoint is disabled - use deps.get_current_user with JWT.
    """
    mock_auth_enabled = os.getenv("MOCK_AUTH_ENABLED", "false").lower() == "true"
    
    # CRITICAL: Force-disable mock auth in production
    if mock_auth_enabled and _is_production_environment():
        logger.critical(
            "SECURITY VIOLATION: MOCK_AUTH_ENABLED=true in production environment! "
            "Forcing mock auth OFF. This is a configuration error."
        )
        mock_auth_enabled = False
    
    # Only allow mock auth if explicitly enabled (and not production)
    if mock_auth_enabled and x_mock_user_id:
        # Eager load role -> permissions -> permission
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        
        # Mock auth: get user by ID from header
        result = await db.execute(
            select(User)
            .options(permission_load)
            .where(User.id == x_mock_user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            return user
    
    # Production: Mock auth not allowed - this function should not be used
    # Use deps.get_current_user instead for JWT-based auth
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Mock auth disabled. Use JWT authentication via /auth/login",
        headers={"WWW-Authenticate": "Bearer"},
    )


def check_permission(user: User, resource: str, action: str) -> bool:
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
    # Delayed import to avoid circular dependency
    from app.api import deps
    
    async def permission_checker(
        current_user: User = Depends(deps.get_current_user),
    ) -> User:
        if not check_permission(current_user, resource, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {resource}:{action}",
            )
        return current_user
    
    return permission_checker
