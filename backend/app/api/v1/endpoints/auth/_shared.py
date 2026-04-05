import hashlib
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import get_effective_permissions, get_scope_label
from app.core.security import create_access_token
from app.core.tokens import (
    create_refresh_token,
    get_request_client_ip,
    get_request_user_agent,
    new_token_jti,
    set_csrf_cookie,
    set_refresh_cookie,
)
from app.models import RefreshToken, Role, User
from app.schemas.auth import TokenResponse

SESSION_RENEWAL_MINIMUM_SECONDS = 60


def _sha256_trunc(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _resolve_access_expires_delta(
    *,
    settings: Settings,
    session_expires_at: datetime | None = None,
) -> timedelta:
    default_lifetime = timedelta(minutes=active_minutes) if (active_minutes := settings.access_token_expire_minutes) else timedelta(minutes=60)
    if session_expires_at is None:
        return default_lifetime

    remaining = coerce_utc(session_expires_at) - utc_now()
    if remaining.total_seconds() <= SESSION_RENEWAL_MINIMUM_SECONDS:
        raise ValueError("session_expiring")
    return min(default_lifetime, remaining)


def _build_token_response(
    user: User,
    *,
    settings: Settings,
    session_expires_at: datetime | None = None,
    post_login_redirect_to: str | None = None,
) -> TokenResponse:
    effective_permissions = get_effective_permissions(user)
    scope_label = get_scope_label(user)
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
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id, "token_version": user.token_version},
        expires_delta=_resolve_access_expires_delta(settings=settings, session_expires_at=session_expires_at),
        settings=settings,
    )
    return TokenResponse(
        access_token=access_token,
        user=user_data,
        post_login_redirect_to=post_login_redirect_to,
    )


async def _issue_refresh_session(
    *,
    db: AsyncSession,
    request: Request,
    response: Response,
    user: User,
    settings: Settings,
    rotated_from: RefreshToken | None = None,
    refresh_jti: str | None = None,
    refresh_token_and_expiry: tuple[str, datetime] | None = None,
    issued_at: datetime | None = None,
) -> RefreshToken:
    jti = refresh_jti or new_token_jti()
    if refresh_token_and_expiry is None:
        refresh_token, expires_at = create_refresh_token(
            user_id=user.id,
            token_version=user.token_version,
            jti=jti,
            settings=settings,
        )
    else:
        refresh_token, expires_at = refresh_token_and_expiry

    now = issued_at or utc_now()
    cookie_max_age = max(int((coerce_utc(expires_at) - now).total_seconds()), 0)
    refresh_row = RefreshToken(
        user_id=user.id,
        jti=jti,
        token_version=user.token_version,
        expires_at=expires_at,
        issued_at=now,
        last_used_at=now,
        created_ip=get_request_client_ip(request, settings.trusted_proxies),
        user_agent=get_request_user_agent(request),
    )
    db.add(refresh_row)
    if rotated_from is not None:
        rotated_from.revoked_at = now
        rotated_from.revoked_reason = "rotated"
        rotated_from.replaced_by_jti = jti
        db.add(rotated_from)

    set_refresh_cookie(response, refresh_token, settings, max_age=cookie_max_age)
    set_csrf_cookie(response, settings, max_age=cookie_max_age)
    return refresh_row


async def _revoke_user_refresh_tokens(
    *,
    db: AsyncSession,
    user_id: int,
    reason: str,
) -> int:
    now = utc_now()
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .where(RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now, revoked_reason=reason)
    )
    return int(result.rowcount or 0)


async def _invalidate_user_sessions(
    *,
    db: AsyncSession,
    user: User,
    reason: str,
) -> int:
    user.token_version += 1
    db.add(user)
    return await _revoke_user_refresh_tokens(db=db, user_id=user.id, reason=reason)


async def _resolve_safe_default_role(db: AsyncSession) -> Role:
    from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES

    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise HTTPException(status_code=500, detail=f"No safe default role found ({candidates}). Seed roles first.")
