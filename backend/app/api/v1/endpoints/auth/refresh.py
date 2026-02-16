from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings, get_settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.tokens import clear_refresh_cookie, get_refresh_cookie, token_decode_or_none
from app.db.session import get_db
from app.models import RefreshToken, Role, RolePermission, User
from app.schemas.auth import TokenResponse

from ._shared import _build_token_response, _issue_refresh_session

router = APIRouter()


@router.post("/refresh", response_model=TokenResponse)
async def refresh_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    raw_token = get_refresh_cookie(request, settings)
    payload = token_decode_or_none(raw_token, settings)
    if not payload:
        clear_refresh_cookie(response, settings)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload.get("user_id")
    jti = payload.get("jti")
    token_version = payload.get("token_version")
    if not isinstance(user_id, int) or not isinstance(jti, str) or not isinstance(token_version, int):
        clear_refresh_cookie(response, settings)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    refresh_row = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .where(RefreshToken.jti == jti)
            .where(RefreshToken.revoked_at.is_(None))
        )
    ).scalar_one_or_none()
    if refresh_row is None:
        clear_refresh_cookie(response, settings)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session not found")

    now = utc_now()
    expires_at = coerce_utc(refresh_row.expires_at)
    if expires_at and expires_at <= now:
        refresh_row.revoked_at = now
        refresh_row.revoked_reason = "expired"
        db.add(refresh_row)
        await db.commit()
        clear_refresh_cookie(response, settings)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    user = (
        await db.execute(
            select(User)
            .options(permission_load, selectinload(User.department))
            .where(User.id == user_id)
        )
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        clear_refresh_cookie(response, settings)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if token_version != user.token_version or refresh_row.token_version != user.token_version:
        refresh_row.revoked_at = now
        refresh_row.revoked_reason = "token_version_mismatch"
        db.add(refresh_row)
        await db.commit()
        clear_refresh_cookie(response, settings)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")

    refresh_row.last_used_at = now
    db.add(refresh_row)
    await _issue_refresh_session(
        db=db,
        request=request,
        response=response,
        user=user,
        settings=settings,
        rotated_from=refresh_row,
    )

    token_response = _build_token_response(user)
    await db.commit()
    return token_response
