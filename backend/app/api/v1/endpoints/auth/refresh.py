from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings, get_settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.logging import get_logger
from app.core.tokens import (
    clear_refresh_cookie,
    create_refresh_token,
    get_refresh_cookie,
    get_request_client_ip,
    get_request_user_agent,
    new_token_jti,
    token_decode_or_none,
)
from app.db.session import get_db
from app.models import RefreshToken, Role, RolePermission, User
from app.schemas.auth import TokenResponse

from ._shared import SESSION_RENEWAL_MINIMUM_SECONDS, _build_token_response, _issue_refresh_session
from ._request_protection import validate_csrf, validate_request_origin

router = APIRouter()
logger = get_logger("auth.refresh")


def _telemetry_fingerprint(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _refresh_unauthorized_response(detail: str, settings: Settings) -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": detail},
    )
    clear_refresh_cookie(response, settings)
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if forbidden_response := validate_request_origin(request, settings):
        return forbidden_response
    if forbidden_response := validate_csrf(request):
        return forbidden_response

    raw_token = get_refresh_cookie(request, settings)
    payload = token_decode_or_none(raw_token, settings)
    if not payload:
        return _refresh_unauthorized_response("Invalid refresh token", settings)

    user_id = payload.get("user_id")
    jti = payload.get("jti")
    token_version = payload.get("token_version")
    if not isinstance(user_id, int) or not isinstance(jti, str) or not isinstance(token_version, int):
        return _refresh_unauthorized_response("Invalid refresh token", settings)

    refresh_row = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .where(RefreshToken.jti == jti)
        )
    ).scalar_one_or_none()
    if refresh_row is None or refresh_row.revoked_at is not None:
        return _refresh_unauthorized_response("Refresh session not found", settings)

    now = utc_now()
    expires_at = coerce_utc(refresh_row.expires_at)
    if expires_at and expires_at <= now:
        revoke_result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == refresh_row.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason="expired")
        )
        if int(revoke_result.rowcount or 0) > 0:
            await db.commit()
        return _refresh_unauthorized_response("Refresh token expired", settings)
    if expires_at and (expires_at - now).total_seconds() <= SESSION_RENEWAL_MINIMUM_SECONDS:
        revoke_result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == refresh_row.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason="expires_soon")
        )
        if int(revoke_result.rowcount or 0) > 0:
            await db.commit()
        return _refresh_unauthorized_response("Refresh token expired", settings)

    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    user = (
        await db.execute(
            select(User)
            .options(permission_load, selectinload(User.department))
            .where(User.id == user_id)
        )
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        return _refresh_unauthorized_response("Unauthorized", settings)

    if token_version != user.token_version or refresh_row.token_version != user.token_version:
        revoke_result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == refresh_row.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason="token_version_mismatch")
        )
        if int(revoke_result.rowcount or 0) > 0:
            await db.commit()
        return _refresh_unauthorized_response("Session revoked", settings)

    current_ip = get_request_client_ip(request, settings.trusted_proxies)
    current_user_agent = get_request_user_agent(request)
    ip_changed = bool(refresh_row.created_ip and current_ip and refresh_row.created_ip != current_ip)
    user_agent_changed = bool(
        refresh_row.user_agent and current_user_agent and refresh_row.user_agent != current_user_agent
    )
    if ip_changed or user_agent_changed:
        logger.warning(
            "refresh_session_context_changed",
            user_id=user.id,
            refresh_token_id=refresh_row.id,
            ip_changed=ip_changed,
            old_ip_sha256=_telemetry_fingerprint(refresh_row.created_ip),
            new_ip_sha256=_telemetry_fingerprint(current_ip),
            user_agent_changed=user_agent_changed,
            old_user_agent_sha256=_telemetry_fingerprint(refresh_row.user_agent),
            new_user_agent_sha256=_telemetry_fingerprint(current_user_agent),
        )

    child_jti = new_token_jti()
    child_lifetime = expires_at - now
    child_refresh_token, child_expires_at = create_refresh_token(
        user_id=user.id,
        token_version=user.token_version,
        jti=child_jti,
        settings=settings,
        expires_delta=child_lifetime,
    )
    rotate_result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.id == refresh_row.id)
        .where(RefreshToken.user_id == user_id)
        .where(RefreshToken.jti == jti)
        .where(RefreshToken.revoked_at.is_(None))
        .values(
            revoked_at=now,
            revoked_reason="rotated",
            replaced_by_jti=child_jti,
            last_used_at=now,
        )
    )
    if int(rotate_result.rowcount or 0) != 1:
        return _refresh_unauthorized_response("Refresh session not found", settings)

    await _issue_refresh_session(
        db=db,
        request=request,
        response=response,
        user=user,
        settings=settings,
        refresh_jti=child_jti,
        refresh_token_and_expiry=(child_refresh_token, child_expires_at),
        issued_at=now,
    )

    token_response = _build_token_response(user, settings=settings, session_expires_at=expires_at)
    await db.commit()
    return token_response
