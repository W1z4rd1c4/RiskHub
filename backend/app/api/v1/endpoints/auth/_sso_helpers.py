"""SSO helper functions extracted from sso.py for maintainability."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.email import email_equals, normalize_email
from app.core.logging import get_logger
from app.core.tokens import clear_sso_challenge_cookie, get_sso_challenge_cookie
from app.core.user_query_options import user_selectinload_options
from app.models import User
from app.schemas.auth import SsoExchangeRequest
from app.services._auth_session_workflow import commit_failed_sso_audit
from app.services._directory_identity import normalize_business_role
from app.services.sso_token_service import SsoProviderUnavailableError, SsoTokenVerificationError

from ._shared import _resolve_safe_default_role

logger = get_logger("auth.sso")


def _user_permission_load():
    return user_selectinload_options(include_permissions=True)


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
        safe_description=description,
        safe_description_siem=description,
        description=description,
    )
    await commit_failed_sso_audit(db)


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
    normalized = value.replace("\\", "/").strip()
    if not normalized or "\r" in normalized or "\n" in normalized:
        return "/"
    if normalized.startswith("/") and not normalized.startswith("//"):
        return normalized
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
    result = await db.execute(
        select(User).options(*_user_permission_load()).where(User.external_id == external_id)
    )
    return result.scalar_one_or_none()


async def _find_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(
        select(User).options(*_user_permission_load()).where(email_equals(User.email, email))
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
        select(User).options(*_user_permission_load()).where(User.id == new_user.id)
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
    challenge_id = get_sso_challenge_cookie(request)
    if not challenge_id:
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: challenge missing"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_CHALLENGE_MISSING",
            detail="SSO login challenge missing or expired.",
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
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: challenge expired"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_CHALLENGE_EXPIRED",
            detail="SSO login challenge expired or was already used.",
        )

    if payload.state != challenge.state:
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: state mismatch"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_STATE_MISMATCH",
            detail="SSO state mismatch.",
        )

    if not identity.nonce:
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: nonce missing"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_NONCE_MISSING",
            detail="SSO token missing nonce claim.",
        )

    if identity.nonce != challenge.nonce:
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: nonce mismatch"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=401,
            code="SSO_NONCE_MISMATCH",
            detail="SSO nonce mismatch.",
        )

    return challenge.return_to, None
