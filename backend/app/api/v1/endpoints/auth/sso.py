import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings, get_settings
from app.core.datetime_utils import utc_now
from app.core.logging import get_logger
from app.core.tokens import (
    clear_sso_challenge_cookie,
    create_refresh_token,
    get_sso_challenge_cookie,
    new_token_jti,
    set_sso_challenge_cookie,
)
from app.db.session import get_db
from app.schemas.auth import SsoExchangeRequest, SsoStartRequest, SsoStartResponse, TokenResponse
from app.services._auth_session import sso_session_outcome
from app.services.sso_challenge_store import SsoChallenge

from ._request_protection import validate_request_origin
from ._shared import (
    SESSION_RENEWAL_MINIMUM_SECONDS,
    _build_token_response,
    _issue_refresh_session,
    _sha256_trunc,
)
from ._sso_helpers import (
    _consume_sso_challenge,
    _jit_provision_user,
    _log_failed_sso,
    _resolve_sso_user,
    _sanitize_return_to,
    _sync_sso_user_profile,
    _verify_sso_identity,
)

router = APIRouter()
logger = get_logger("auth.sso")


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
    if settings.auth_mode not in ("microsoft_sso", "hybrid_dev"):
        return JSONResponse(status_code=403, content={"detail": "SSO is not enabled.", "code": "SSO_DISABLED"})
    if forbidden_response := validate_request_origin(request, settings):
        return forbidden_response

    challenge_store = getattr(request.app.state, "sso_challenge_store", None)
    if challenge_store is None:
        return JSONResponse(
            status_code=503,
            content={"detail": "SSO challenge store unavailable.", "code": "SSO_CHALLENGE_UNAVAILABLE"},
        )

    ttl_seconds = max(int(settings.auth_sso_challenge_ttl_seconds), SESSION_RENEWAL_MINIMUM_SECONDS)
    existing_challenge_id = get_sso_challenge_cookie(request)
    if existing_challenge_id:
        await challenge_store.delete(existing_challenge_id)

    challenge = SsoChallenge(
        challenge_id=secrets.token_urlsafe(32),
        nonce=secrets.token_urlsafe(32),
        state=secrets.token_urlsafe(32),
        return_to=_sanitize_return_to(payload.return_to),
        issued_at=utc_now(),
        expires_at=utc_now() + timedelta(seconds=ttl_seconds),
    )
    await challenge_store.store(challenge)
    set_sso_challenge_cookie(response, challenge.challenge_id, settings, max_age=ttl_seconds)
    return SsoStartResponse(nonce=challenge.nonce, state=challenge.state, expires_in=ttl_seconds)


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
    if settings.auth_mode not in ("microsoft_sso", "hybrid_dev"):
        return JSONResponse(status_code=403, content={"detail": "SSO is not enabled.", "code": "SSO_DISABLED"})

    identity, error_response = await _verify_sso_identity(payload=payload, settings=settings, db=db)
    if error_response is not None:
        return error_response

    post_login_redirect_to, challenge_error = await _consume_sso_challenge(
        request=request,
        response=response,
        payload=payload,
        identity=identity,
        settings=settings,
        db=db,
    )
    if challenge_error is not None:
        return challenge_error

    user, resolution_error = await _resolve_sso_user(db, identity=identity, settings=settings)
    if resolution_error is not None:
        return resolution_error
    if user is None:
        if not settings.entra_jit_provisioning_enabled:
            await _log_failed_sso(
                db,
                entity_name=identity.email or "unknown",
                description="Failed SSO login: user not provisioned",
            )
            return JSONResponse(
                status_code=403,
                content={"detail": "User not provisioned", "code": "SSO_USER_NOT_PROVISIONED"},
            )

        if not identity.email or "@" not in identity.email:
            await _log_failed_sso(
                db,
                entity_name="unknown",
                description="Failed SSO login: missing email claim",
            )
            return JSONResponse(status_code=400, content={"detail": "Email claim missing", "code": "SSO_EMAIL_MISSING"})
        user = await _jit_provision_user(db, identity=identity)

    profile_sync_error = await _sync_sso_user_profile(db, user=user, identity=identity)
    if profile_sync_error is not None:
        return profile_sync_error

    if not user.is_active:
        return JSONResponse(status_code=403, content={"detail": "User account is inactive", "code": "USER_INACTIVE"})

    now = utc_now()
    session_outcome = sso_session_outcome(
        now=now,
        identity_expires_at=identity.expires_at,
        settings=settings,
        renewal_minimum_seconds=SESSION_RENEWAL_MINIMUM_SECONDS,
    )
    if session_outcome.status == "token_expired" and session_outcome.audit_plan is not None:
        await _log_failed_sso(
            db,
            entity_name=identity.email or "unknown",
            description="Failed SSO login: token lifetime too short for local session",
        )
        return JSONResponse(
            status_code=session_outcome.status_code or 401,
            content={"detail": session_outcome.detail, "code": session_outcome.code},
        )
    if session_outcome.status == "token_expired":
        return JSONResponse(
            status_code=session_outcome.status_code or 401,
            content={"detail": session_outcome.detail, "code": session_outcome.code},
        )
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
        post_login_redirect_to=post_login_redirect_to,
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
