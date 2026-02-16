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

from ._shared import _revoke_user_refresh_tokens

router = APIRouter()


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Logout endpoint (server-side refresh token revocation + cookie clear).

    Returns:
        Success message
    """
    raw_token = get_refresh_cookie(request, settings)
    payload = token_decode_or_none(raw_token, settings)
    if payload:
        jti = payload.get("jti")
        user_id = payload.get("user_id")
        if isinstance(jti, str) and isinstance(user_id, int):
            refresh_row = (
                await db.execute(
                    select(RefreshToken)
                    .where(RefreshToken.user_id == user_id)
                    .where(RefreshToken.jti == jti)
                    .where(RefreshToken.revoked_at.is_(None))
                )
            ).scalar_one_or_none()
            if refresh_row:
                refresh_row.revoked_reason = "logout"
                from app.core.datetime_utils import utc_now

                refresh_row.revoked_at = utc_now()
                db.add(refresh_row)
                await db.commit()

    clear_refresh_cookie(response, settings)
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all_devices(
    response: Response,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    current_user.token_version += 1
    db.add(current_user)
    revoked = await _revoke_user_refresh_tokens(db=db, user_id=current_user.id, reason="logout_all")

    clear_refresh_cookie(response, settings)
    await db.commit()

    return {"message": "Logged out from all devices", "revoked_sessions": revoked}
