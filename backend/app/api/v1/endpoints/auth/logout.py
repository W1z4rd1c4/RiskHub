from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from app.api import deps
from app.core.config import Settings, get_settings
from app.core.tokens import clear_refresh_cookie, get_refresh_cookie, token_decode_or_none
from app.db.session import get_db
from app.models import RefreshToken, User

from ._request_protection import validate_csrf, validate_request_origin
from ._shared import _invalidate_user_sessions

router = APIRouter()


async def _resolve_refresh_cookie_user(
    *,
    db: AsyncSession,
    request: Request,
    settings: Settings,
) -> User | None:
    raw_token = get_refresh_cookie(request, settings)
    payload = token_decode_or_none(raw_token, settings)
    if not payload:
        return None

    user_id = payload.get("user_id")
    jti = payload.get("jti")
    token_version = payload.get("token_version")
    if not isinstance(user_id, int) or not isinstance(jti, str) or not isinstance(token_version, int):
        return None

    refresh_row = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .where(RefreshToken.jti == jti)
            .where(RefreshToken.revoked_at.is_(None))
        )
    ).scalar_one_or_none()
    if refresh_row is None:
        return None

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    if token_version != user.token_version or refresh_row.token_version != user.token_version:
        return None
    return user


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User | None = Depends(deps.get_current_user_optional),
):
    """
    Logout endpoint (server-side refresh token revocation + cookie clear).

    Returns:
        Success message
    """
    resolved_user = current_user
    require_csrf = False

    if resolved_user is None:
        resolved_user = await _resolve_refresh_cookie_user(db=db, request=request, settings=settings)
        require_csrf = resolved_user is not None

    if resolved_user is not None:
        if forbidden_response := validate_request_origin(request, settings):
            return forbidden_response
        if require_csrf and (forbidden_response := validate_csrf(request)):
            return forbidden_response

        revoked = await _invalidate_user_sessions(db=db, user=resolved_user, reason="logout")
        clear_refresh_cookie(response, settings)
        await db.commit()
        return {"message": "Logged out successfully", "revoked_sessions": revoked}

    clear_refresh_cookie(response, settings)
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all_devices(
    response: Response,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    revoked = await _invalidate_user_sessions(db=db, user=current_user, reason="logout_all")
    clear_refresh_cookie(response, settings)
    await db.commit()

    return {"message": "Logged out from all devices", "revoked_sessions": revoked}
