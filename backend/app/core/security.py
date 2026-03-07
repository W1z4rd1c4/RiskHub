import logging
from datetime import UTC, datetime, timedelta
from typing import Iterable, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import InvalidTokenError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.permissions import ensure_business_view_access, has_permission
from app.db.session import get_db
from app.models import Role, RolePermission, User

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)
DUMMY_PASSWORD_HASH = "$2b$12$PKiOVCVtyq61.6OteU0aAOhNxM5hP3/jHGgVLh0mQYZe0B2YfM7uy"

# Backward-compatible alias used by auth dependencies.
TokenDecodeError = InvalidTokenError

# Password hashing utilities
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def verify_password_or_dummy(plain_password: str, hashed_password: str | None) -> bool:
    """Verify a password, falling back to a fixed dummy hash for timing normalization."""
    target_hash = hashed_password or DUMMY_PASSWORD_HASH
    verified = pwd_context.verify(plain_password, target_hash)
    return bool(hashed_password) and verified


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
        InvalidTokenError: If token is invalid or expired
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
    current_settings = get_settings()
    mock_auth_enabled = current_settings.mock_auth_enabled and current_settings.debug

    # Only allow mock auth in explicit debug+mock mode
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
    """
    Backwards-compatible permission check.

    Canonical permission evaluation lives in app.core.permissions.has_permission.
    """
    return has_permission(user, resource, action)


def forbid(detail: str) -> None:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def require_any_permission(permissions: Iterable[tuple[str, str]]):
    """FastAPI dependency factory for requiring any one of the provided permissions."""
    from app.api import deps

    perms = list(permissions)
    if not perms:
        raise ValueError("require_any_permission() requires at least one (resource, action) pair")

    async def permission_checker(current_user: User = Depends(deps.get_current_user)) -> User:
        if not any(check_permission(current_user, resource, action) for resource, action in perms):
            required = ", ".join(f"{r}:{a}" for r, a in perms)
            forbid(f"Permission denied: requires one of [{required}]")
        return current_user

    return permission_checker


def require_permission(resource: str, action: str):
    """FastAPI dependency factory for requiring specific permissions."""
    # Delayed import to avoid circular dependency
    from app.api import deps

    async def permission_checker(
        current_user: User = Depends(deps.get_current_user),
    ) -> User:
        if not check_permission(current_user, resource, action):
            forbid(f"Permission denied: {resource}:{action}")
        return current_user

    return permission_checker


def require_business_permission(
    resource: str,
    action: str,
    *,
    detail: str = "Platform admins cannot access business data",
):
    """Require a permission while explicitly blocking platform admins from business views."""
    from app.api import deps

    async def permission_checker(
        current_user: User = Depends(deps.get_current_user),
    ) -> User:
        ensure_business_view_access(current_user, detail=detail)
        if not check_permission(current_user, resource, action):
            forbid(f"Permission denied: {resource}:{action}")
        return current_user

    return permission_checker
