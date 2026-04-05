import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings, get_settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.email import email_equals, normalize_email
from app.core.logging import get_logger
from app.core.tokens import (
    clear_sso_challenge_cookie,
    create_refresh_token,
    get_sso_challenge_cookie,
    new_token_jti,
    refresh_token_lifetime,
    set_sso_challenge_cookie,
)
from app.db.session import get_db
from app.models import Role, RolePermission, User
from app.schemas.auth import SsoExchangeRequest, SsoStartRequest, SsoStartResponse, TokenResponse
from app.services.directory_identity_service import normalize_business_role
from app.services.sso_challenge_store import SsoChallenge
from app.services.sso_token_service import SsoProviderUnavailableError, SsoTokenVerificationError

from ._request_protection import validate_request_origin
from ._shared import (
    SESSION_RENEWAL_MINIMUM_SECONDS,
    _build_token_response,
    _issue_refresh_session,
    _resolve_safe_default_role,
    _sha256_trunc,
)

router = APIRouter()
logger = get_logger("auth.sso")


def _user_permission_load():
    return selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)


async def _log_failed_sso(
    db: AsyncSession,
    *,
    entity_name: str,
    description: str,
) -> None:
    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    await log_activity(
        db=db,
        actor=None,
        action=ActivityAction.FAILED_LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=0,
        entity_name=entity_name,
        description=description,
    )
    await db.commit()


async def _verify_sso_identity(
    *,
    payload: SsoExchangeRequest,
    settings: Settings,
    db: AsyncSession,
):
    try:
        import app.api.v1.endpoints.auth as auth_pkg

        identity = await auth_pkg.verify_entra_id_token(id_token=payload.id_token, settings=settings)
    except SsoProviderUnavailableError:
        await _log_failed_sso(
            db,
            entity_name="sso",
            description="Failed SSO login: verification unavailable",
        )
        return None, JSONResponse(
            status_code=503,
            content={
                "detail": "SSO verification unavailable. Please try again later.",
                "code": "SSO_DISCOVERY_FAILED",
            },
        )
    except SsoTokenVerificationError as e:
        await _log_failed_sso(
            db,
            entity_name="sso",
            description=f"Failed SSO login: {e.code}",
        )
        status_code = 401
        code = "SSO_TOKEN_INVALID"
        if e.code == "tenant_mismatch":
            code = "SSO_TENANT_MISMATCH"
        elif e.code == "email_domain_not_allowed":
            status_code = 403
            code = "SSO_EMAIL_DOMAIN_FORBIDDEN"
        elif e.code == "email_required":
            status_code = 400
            code = "SSO_EMAIL_MISSING"
        elif e.code == "missing_token":
            status_code = 400
            code = "SSO_TOKEN_INVALID"
        return None, JSONResponse(status_code=status_code, content={"detail": "Invalid SSO token", "code": code})

    return identity, None


def _sanitize_return_to(value: str | None) -> str:
    if not value:
        return "/"
    if value.startswith("/") and not value.startswith("//"):
        return value
    return "/"


def _challenge_response(
    *,
    settings: Settings,
    status_code: int,
    code: str,
    detail: str,
) -> JSONResponse:
    response = JSONResponse(status_code=status_code, content={"detail": detail, "code": code})
    clear_sso_challenge_cookie(response, settings)
    return response


async def _find_user_by_external_id(db: AsyncSession, external_id: str):
    permission_load = _user_permission_load()
    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(User.external_id == external_id)
    )
    return result.scalar_one_or_none()


async def _find_user_by_email(db: AsyncSession, email: str):
    permission_load = _user_permission_load()
    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(email_equals(User.email, email))
    )
    return result.scalar_one_or_none()


async def _sync_sso_user_profile(
    db: AsyncSession,
    *,
    user: User,
    identity,
):
    now = utc_now()
    if identity.name and user.name != identity.name:
        user.name = identity.name

    normalized_email = normalize_email(identity.email)
    if normalized_email is not None and normalized_email != user.email:
        conflicting_user = await _find_user_by_email(db, normalized_email)
        if conflicting_user is not None and conflicting_user.id != user.id:
            await _log_failed_sso(
                db,
                entity_name=identity.email or "unknown",
                description="Failed SSO login: identity conflict",
            )
            return JSONResponse(
                status_code=409,
                content={"detail": "SSO identity conflict", "code": "SSO_IDENTITY_COLLISION"},
            )
        user.email = normalized_email

    business_role = normalize_business_role(identity.business_role)
    if business_role is not None and user.entra_business_role != business_role:
        user.entra_business_role = business_role
    if business_role is not None:
        user.entra_business_role_last_synced_at = now

    db.add(user)
    await db.flush()
    return None


async def _resolve_sso_user(
    db: AsyncSession,
    *,
    identity,
    settings: Settings,
):
    user = await _find_user_by_external_id(db, identity.external_id)
    if user is not None:
        return user, None

    if not identity.email:
        return None, None

    email_user = await _find_user_by_email(db, identity.email)
    if email_user is None:
        return None, None

    if email_user.external_id not in (None, identity.external_id):
        await _log_failed_sso(
            db,
            entity_name=identity.email or "unknown",
            description="Failed SSO login: identity conflict",
        )
        return None, JSONResponse(
            status_code=409,
            content={"detail": "SSO identity conflict", "code": "SSO_IDENTITY_COLLISION"},
        )

    if email_user.external_id is None:
        if not settings.auth_sso_allow_email_link:
            await _log_failed_sso(
                db,
                entity_name=identity.email or "unknown",
                description="Failed SSO login: explicit directory linking required",
            )
            return None, JSONResponse(
                status_code=403,
                content={"detail": "SSO account link required", "code": "SSO_LINK_REQUIRED"},
            )
        email_user.external_id = identity.external_id
        db.add(email_user)
        await db.flush()

    return email_user, None


async def _jit_provision_user(db: AsyncSession, *, identity):
    permission_load = _user_permission_load()
    default_role = await _resolve_safe_default_role(db)
    normalized_email = normalize_email(identity.email)
    if normalized_email is None:
        raise ValueError("identity.email must be present for JIT provisioning")
    new_user = User(
        email=normalized_email,
        name=identity.name or normalized_email,
        external_id=identity.external_id,
        hashed_password=None,
        role_id=default_role.id,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()

    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(User.id == new_user.id)
    )
    return result.scalar_one()


async def _consume_sso_challenge(
    *,
    request: Request,
    response: Response,
    payload: SsoExchangeRequest,
    identity,
    settings: Settings,
    db: AsyncSession,
):
    requires_challenge = settings.auth_sso_require_challenge or payload.state is not None
    if not requires_challenge:
        return "/", None

    challenge_id = get_sso_challenge_cookie(request)
    if not challenge_id:
        await _log_failed_sso(db, entity_name=identity.email or "unknown", description="Failed SSO login: challenge missing")
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_CHALLENGE_MISSING",
            detail="SSO login challenge missing or expired.",
        )

    if not payload.state:
        await _log_failed_sso(db, entity_name=identity.email or "unknown", description="Failed SSO login: state missing")
        return None, _challenge_response(
            settings=settings,
            status_code=400,
            code="SSO_STATE_MISSING",
            detail="SSO state is required.",
        )

    challenge_store = getattr(request.app.state, "sso_challenge_store", None)
    if challenge_store is None:
        return None, JSONResponse(
            status_code=503,
            content={"detail": "SSO challenge store unavailable.", "code": "SSO_CHALLENGE_UNAVAILABLE"},
        )

    challenge = await challenge_store.consume(challenge_id)
    clear_sso_challenge_cookie(response, settings)
    if challenge is None:
        await _log_failed_sso(db, entity_name=identity.email or "unknown", description="Failed SSO login: challenge expired")
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_CHALLENGE_EXPIRED",
            detail="SSO login challenge expired or was already used.",
        )

    if payload.state != challenge.state:
        await _log_failed_sso(db, entity_name=identity.email or "unknown", description="Failed SSO login: state mismatch")
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_STATE_MISMATCH",
            detail="SSO state mismatch.",
        )

    if not identity.nonce:
        await _log_failed_sso(db, entity_name=identity.email or "unknown", description="Failed SSO login: nonce missing")
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_NONCE_MISSING",
            detail="SSO token missing nonce claim.",
        )

    if identity.nonce != challenge.nonce:
        await _log_failed_sso(db, entity_name=identity.email or "unknown", description="Failed SSO login: nonce mismatch")
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_NONCE_MISMATCH",
            detail="SSO nonce mismatch.",
        )

    return challenge.return_to, None


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
    session_expires_at = min(now + refresh_token_lifetime(settings), coerce_utc(identity.expires_at))
    remaining_lifetime = session_expires_at - now
    if remaining_lifetime.total_seconds() <= SESSION_RENEWAL_MINIMUM_SECONDS:
        await _log_failed_sso(
            db,
            entity_name=identity.email or "unknown",
            description="Failed SSO login: token lifetime too short for local session",
        )
        return JSONResponse(
            status_code=401,
            content={"detail": "SSO token expired or near expiry", "code": "SSO_TOKEN_EXPIRED"},
        )

    refresh_jti = new_token_jti()
    refresh_token, refresh_expires_at = create_refresh_token(
        user_id=user.id,
        token_version=user.token_version,
        jti=refresh_jti,
        settings=settings,
        expires_delta=remaining_lifetime,
    )
    token_response = _build_token_response(
        user,
        settings=settings,
        session_expires_at=session_expires_at,
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
