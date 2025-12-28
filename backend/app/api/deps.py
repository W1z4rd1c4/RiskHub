"""Dependency injection utilities for FastAPI endpoints."""
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.core.security import decode_access_token
from app.models import User, Role, RolePermission

security = HTTPBearer(auto_error=False)


from app.core.config import get_settings, Settings

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    x_mock_user_id: int | None = Header(None, alias="X-Mock-User-Id"),
) -> User:
    """
    Get current user. Supports JWT or X-Mock-User-Id (testing only).
    """
    import logging
    
    logger = logging.getLogger(__name__)
    user_id = None
    
    # 1. Check Mock Auth (Development/Testing only)
    # STRICT CHECK: Must be enabled in settings AND debug mode must be True
    if x_mock_user_id and settings.mock_auth_enabled and settings.debug:
        logger.warning(f"MOCK AUTH USED: User ID {x_mock_user_id} - DO NOT USE IN PRODUCTION")
        user_id = x_mock_user_id
    
    # 2. Check JWT
    elif credentials:
        try:
            token = credentials.credentials
            payload = decode_access_token(token)
            user_id = payload.get("user_id")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
            
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Eager load role -> permissions -> permission AND department
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    
    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    return user


async def get_current_user_optional(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User | None:
    """
    Optional authentication for endpoints that work with/without auth.
    
    Args:
        authorization: Optional Authorization header
        db: Database session
        
    Returns:
        User if authenticated, None otherwise
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    
    try:
        token = authorization.split(" ")[1]
        payload = decode_access_token(token)
        user_id = payload.get("user_id")
        if user_id:
            result = await db.execute(
                select(User).where(User.id == user_id)
            )
            return result.scalar_one_or_none()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"Optional auth failed: {str(e)}")
        pass
    
    return None
