"""Dependency injection utilities for FastAPI endpoints."""
from datetime import timedelta

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


def _user_permission_load():
    return selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)


async def _resolve_bearer_user(
    *,
    db: AsyncSession,
    settings: Settings,
    token: str,
    update_last_active: bool,
    optional: bool,
) -> User | None:
    try:
        payload = decode_access_token(token, settings=settings)
        user_id = payload.get("user_id")
        token_version_claim = payload.get("token_version")
        if not isinstance(user_id, int):
            raise HTTPException(status_code=401, detail="Invalid token")
        if token_version_claim is not None and not isinstance(token_version_claim, int):
            raise HTTPException(status_code=401, detail="Invalid token")
    except (TokenDecodeError, HTTPException) as exc:
        if optional:
            return None
        if isinstance(exc, HTTPException):
            raise exc
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    result = await db.execute(
        select(User)
        .options(_user_permission_load(), selectinload(User.department))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        if optional:
            return None
        raise HTTPException(status_code=401, detail="Unauthorized")

    if token_version_claim is not None and token_version_claim != user.token_version:
        if optional:
            return None
        raise HTTPException(status_code=401, detail="Session revoked")

    if update_last_active:
        now = utc_now()
        last_active = coerce_utc(user.last_active_at)
        should_update = not last_active or (now - last_active) > timedelta(minutes=1)
        if should_update:
            # Keep the write best-effort and in-session so callers control commits.
            user.last_active_at = now
            db.add(user)

    return user


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

    # 1. Check Mock Auth (Development/Testing only)
    # STRICT CHECK: Must be enabled in settings AND debug mode must be True
    if x_mock_user_id and settings.mock_auth_enabled and settings.debug:
        logger.warning(f"MOCK AUTH USED: User ID {x_mock_user_id} - DO NOT USE IN PRODUCTION")
        result = await db.execute(
            select(User)
            .options(_user_permission_load(), selectinload(User.department))
            .where(User.id == x_mock_user_id)
        )
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Unauthorized")
        return user

    # 2. Check JWT
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return await _resolve_bearer_user(
        db=db,
        settings=settings,
        token=credentials.credentials,
        update_last_active=True,
        optional=False,
    )


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
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
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
        token = authorization.split(" ", 1)[1]
        return await _resolve_bearer_user(
            db=db,
            settings=settings,
            token=token,
            update_last_active=False,
            optional=True,
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"Optional auth failed: {str(e)}")
        pass

    return None
