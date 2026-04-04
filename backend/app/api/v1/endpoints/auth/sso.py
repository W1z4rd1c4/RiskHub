from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings, get_settings
from app.core.email import email_equals, normalize_email
from app.db.session import get_db
from app.models import Role, RolePermission, User
from app.schemas.auth import SsoExchangeRequest, TokenResponse
from app.services.sso_token_service import SsoProviderUnavailableError, SsoTokenVerificationError

from ._shared import _build_token_response, _issue_refresh_session, _resolve_safe_default_role, _sha256_trunc

router = APIRouter()


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


async def _link_existing_user_if_needed(
    db: AsyncSession,
    *,
    user: User,
    identity,
):
    if user.external_id is None:
        user.external_id = identity.external_id
        if identity.name and user.name != identity.name:
            user.name = identity.name
        db.add(user)
        await db.flush()
        return None

    if user.external_id != identity.external_id:
        await _log_failed_sso(
            db,
            entity_name=identity.email or "unknown",
            description="Failed SSO login: identity conflict",
        )
        return JSONResponse(
            status_code=409,
            content={"detail": "SSO identity conflict", "code": "SSO_IDENTITY_COLLISION"},
        )
    return None


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

    user = await _find_user_by_external_id(db, identity.external_id)

    if user is None and identity.email:
        user = await _find_user_by_email(db, identity.email)
        if user is not None:
            collision = await _link_existing_user_if_needed(db, user=user, identity=identity)
            if collision is not None:
                return collision

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

    if not user.is_active:
        return JSONResponse(status_code=403, content={"detail": "User account is inactive", "code": "USER_INACTIVE"})

    token_response = _build_token_response(user, settings=settings)
    await _issue_refresh_session(db=db, request=request, response=response, user=user, settings=settings)

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
    await db.commit()
    return token_response
