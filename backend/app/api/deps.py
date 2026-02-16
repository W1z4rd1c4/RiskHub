"""Dependency injection utilities for FastAPI endpoints."""
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import can_view_risk_committee
from app.core.security import TokenDecodeError, decode_access_token
from app.db.session import get_db
from app.models import Role, RolePermission, User

security = HTTPBearer(auto_error=False)


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
    token_version_claim: int | None = None

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
            claim = payload.get("token_version")
            if isinstance(claim, int):
                token_version_claim = claim
            elif claim is not None:
                raise HTTPException(status_code=401, detail="Invalid token")
        except TokenDecodeError:
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

    if token_version_claim is not None and token_version_claim != user.token_version:
        raise HTTPException(status_code=401, detail="Session revoked")

    # Update last_active_at (debounced 1 min to reduce DB writes)
    from datetime import timedelta

    now = utc_now()
    last_active = coerce_utc(user.last_active_at)
    should_update = not last_active or (now - last_active) > timedelta(minutes=1)

    if should_update:
        # Update last_active_at in-session. Do NOT commit here to avoid
        # breaking transaction boundaries for the caller. The update will
        # be committed by endpoints that write (POST/PUT/DELETE) or flushed
        # at session cleanup. For read-only GET requests the update may not
        # persist, which is acceptable for best-effort presence tracking.
        user.last_active_at = now
        db.add(user)

    return user


async def get_current_committee_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Committee dashboard access:
    - Privileged users (global) OR
    - Department Heads (department-scoped)
    """
    if not can_view_risk_committee(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return current_user


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
