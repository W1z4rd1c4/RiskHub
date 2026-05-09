from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.core.tokens import (
    clear_sso_challenge_cookie,
    create_refresh_token,
    new_token_jti,
    set_sso_challenge_cookie,
)
from app.db.session import get_db
from app.schemas.auth import SsoExchangeRequest, SsoStartRequest, SsoStartResponse, TokenResponse
from app.services._auth_session import resolve_sso_exchange, resolve_sso_start

from ._request_protection import validate_request_origin
from ._shared import (
    _build_token_response,
    _issue_refresh_session,
    _sha256_trunc,
)

router = APIRouter()
logger = get_logger("auth.sso")


def _sso_failure_response(failure, *, settings: Settings, clear_challenge_cookie: bool = False) -> JSONResponse:
    response = JSONResponse(
        status_code=int(failure.status_code),
        content={"detail": failure.detail, "code": failure.code},
    )
    if clear_challenge_cookie:
        clear_sso_challenge_cookie(response, settings)
    return response


@router.post(
    "/sso/start",
    response_model=SsoStartResponse,
    responses={
        403: {"description": "SSO disabled or origin not allowed."},
        503: {"description": "SSO challenge store unavailable."},
    },
)
async def sso_start(
    payload: SsoStartRequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
):
    if forbidden_response := validate_request_origin(request, settings):
        return forbidden_response

    start = await resolve_sso_start(
        payload=payload,
        request=request,
        settings=settings,
    )
    if start.failure is not None:
        return _sso_failure_response(
            start.failure,
            settings=settings,
            clear_challenge_cookie=start.failure.clear_challenge_cookie,
        )
    assert start.response is not None
    assert start.challenge_id is not None
    assert start.max_age is not None
    set_sso_challenge_cookie(response, start.challenge_id, settings, max_age=start.max_age)
    return start.response


@router.post(
    "/sso/exchange",
    response_model=TokenResponse,
    responses={
        400: {"description": "Invalid request payload for SSO exchange."},
        401: {"description": "SSO token verification failed."},
        403: {"description": "SSO disabled or identity/user is not allowed."},
        409: {"description": "SSO identity collision detected."},
        422: {"description": "Validation error for malformed or invalid JSON payload."},
        503: {"description": "SSO provider metadata/discovery unavailable."},
    },
)
async def sso_exchange(
    payload: SsoExchangeRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    from app.api.v1.endpoints import auth as auth_pkg

    exchange = await resolve_sso_exchange(
        payload=payload,
        request=request,
        db=db,
        settings=settings,
        token_verifier=auth_pkg.verify_entra_id_token,
    )

    if exchange.failure is not None:
        return _sso_failure_response(
            exchange.failure,
            settings=settings,
            clear_challenge_cookie=exchange.clear_challenge_cookie or exchange.failure.clear_challenge_cookie,
        )
    user = exchange.user
    identity = exchange.identity
    session_outcome = exchange.outcome
    now = exchange.now
    assert user is not None
    assert identity is not None
    assert now is not None
    assert session_outcome.session_expires_at is not None
    assert session_outcome.remaining_lifetime is not None

    refresh_jti = new_token_jti()
    refresh_token, refresh_expires_at = create_refresh_token(
        user_id=user.id,
        token_version=user.token_version,
        jti=refresh_jti,
        settings=settings,
        expires_delta=session_outcome.remaining_lifetime,
    )
    token_response = _build_token_response(
        user,
        settings=settings,
        session_expires_at=session_outcome.session_expires_at,
        post_login_redirect_to=exchange.post_login_redirect_to,
    )
    await _issue_refresh_session(
        db=db,
        request=request,
        response=response,
        user=user,
        settings=settings,
        refresh_jti=refresh_jti,
        refresh_token_and_expiry=(refresh_token, refresh_expires_at),
        issued_at=now,
    )
    clear_sso_challenge_cookie(response, settings)

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        safe_description="User logged in (sso)",
        safe_description_siem="User logged in (sso)",
        description=(
            f"User logged in (sso): {user.email} "
            f"tenant_sha256={_sha256_trunc(identity.tenant_id)} oid_sha256={_sha256_trunc(identity.external_id)}"
        ),
    )
    logger.info(
        "sso_login_success",
        user_id=user.id,
        oid_sha256=_sha256_trunc(identity.external_id),
        tenant_sha256=_sha256_trunc(identity.tenant_id),
        entra_business_role_present=identity.business_role is not None,
    )
    await db.commit()
    return token_response
