from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

import secrets

from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from app.core.activity_logger import audit_logger, log_activity
from app.core.config import Settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.email import email_equals, normalize_email
from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES
from app.core.tokens import (
    clear_refresh_cookie,
    clear_sso_challenge_cookie,
    get_sso_challenge_cookie,
    refresh_token_lifetime,
    set_sso_challenge_cookie,
    token_decode_or_none,
)
from app.core.user_query_options import user_selectinload_options
from app.models import RefreshToken, Role, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.auth import SsoExchangeRequest, SsoStartRequest, SsoStartResponse
from app.services.directory_identity_service import normalize_business_role
from app.services.sso_challenge_store import SsoChallenge
from app.services.sso_token_service import SsoProviderUnavailableError, SsoTokenVerificationError

SESSION_RENEWAL_MINIMUM_SECONDS = 60
RefreshStatus = Literal[
    "success",
    "invalid_token",
    "session_not_found",
    "replay_detected",
    "expired",
    "expires_soon",
    "inactive_user",
    "token_version_mismatch",
    "context_changed",
]
SsoStatus = Literal[
    "challenge_accepted",
    "challenge_expired",
    "replayed_challenge",
    "jit_created",
    "jit_updated",
    "blocked",
    "success",
    "token_expired",
]


@dataclass(frozen=True)
class SessionCookiePlan:
    action: Literal["set_refresh", "clear_refresh", "none"]


@dataclass(frozen=True)
class SessionAuditPlan:
    event_type: str
    failure_code: str | None = None
    revoke_count: int = 0
    context_changed: bool = False


@dataclass(frozen=True)
class RefreshSessionOutcome:
    status: RefreshStatus
    cookie_plan: SessionCookiePlan
    audit_plan: SessionAuditPlan
    ip_changed: bool = False
    user_agent_changed: bool = False


@dataclass(frozen=True)
class RefreshSessionResolution:
    outcome: RefreshSessionOutcome
    detail: str
    user: User | None = None
    refresh_row: RefreshToken | None = None
    user_id: int | None = None
    jti: str | None = None
    now: datetime | None = None
    expires_at: datetime | None = None
    context_outcome: RefreshSessionOutcome | None = None

    @property
    def is_authorized(self) -> bool:
        return self.outcome.status in {"success", "context_changed"}


@dataclass(frozen=True)
class SsoSessionOutcome:
    status: SsoStatus
    cookie_plan: SessionCookiePlan
    audit_plan: SessionAuditPlan | None = None
    session_expires_at: datetime | None = None
    remaining_lifetime: timedelta | None = None
    status_code: int | None = None
    detail: str | None = None
    code: str | None = None


@dataclass(frozen=True)
class SsoExchangeResolution:
    outcome: SsoSessionOutcome
    user: User | None = None
    identity: object | None = None
    post_login_redirect_to: str | None = None
    error_response: JSONResponse | None = None
    now: datetime | None = None

    @property
    def is_authorized(self) -> bool:
        return self.error_response is None and self.user is not None and self.outcome.status == "success"


def refresh_session_context_outcome(
    *,
    stored_ip: str | None,
    current_ip: str | None,
    stored_user_agent: str | None,
    current_user_agent: str | None,
) -> RefreshSessionOutcome:
    ip_changed = bool(stored_ip and current_ip and stored_ip != current_ip)
    user_agent_changed = bool(stored_user_agent and current_user_agent and stored_user_agent != current_user_agent)
    return RefreshSessionOutcome(
        status="context_changed" if ip_changed or user_agent_changed else "success",
        cookie_plan=SessionCookiePlan(action="none"),
        audit_plan=SessionAuditPlan(
            event_type="refresh_session_context_changed",
            context_changed=ip_changed or user_agent_changed,
        ),
        ip_changed=ip_changed,
        user_agent_changed=user_agent_changed,
    )


def apply_session_cookie_plan(
    *,
    response: Response,
    settings: Settings,
    plan: SessionCookiePlan,
) -> None:
    if plan.action == "clear_refresh":
        clear_refresh_cookie(response, settings)


async def record_session_audit_plan(
    *,
    db: AsyncSession,
    user: User | None,
    plan: SessionAuditPlan,
) -> None:
    if user is None or plan.event_type != ActivityAction.FAILED_REFRESH.value:
        return

    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.FAILED_REFRESH,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        safe_description="User refresh failed",
        safe_description_siem="User refresh failed",
        changes={
            "failure_code": plan.failure_code,
            "revoke_count": plan.revoke_count,
        },
    )


def _failed_refresh_outcome(
    status_value: RefreshStatus,
    *,
    failure_code: str,
    revoke_count: int = 0,
) -> RefreshSessionOutcome:
    return RefreshSessionOutcome(
        status=status_value,
        cookie_plan=SessionCookiePlan(action="clear_refresh"),
        audit_plan=SessionAuditPlan(
            event_type=ActivityAction.FAILED_REFRESH.value,
            failure_code=failure_code,
            revoke_count=revoke_count,
        ),
    )


def _emit_failed_refresh_audit(
    *,
    failure_code: str,
    detail: str,
    user_id: int | None = None,
) -> None:
    audit_logger.warning(
        "failed_refresh",
        feature="audit",
        event_type=ActivityAction.FAILED_REFRESH.value,
        entity_type=ActivityEntityType.USER.value,
        entity_id=user_id,
        actor_id=user_id,
        description="User refresh failed",
        changes={"failure_code": failure_code},
        detail=detail,
    )


async def _load_refresh_user(db: AsyncSession, user_id: int) -> User | None:
    return (
        await db.execute(
            select(User)
            .options(*user_selectinload_options(include_permissions=True))
            .where(User.id == user_id)
        )
    ).scalar_one_or_none()


async def revoke_rotated_refresh_descendants(
    *,
    db: AsyncSession,
    user_id: int,
    replaced_by_jti: str | None,
    now: datetime,
) -> int:
    revoke_count = 0
    next_jti = replaced_by_jti
    visited: set[str] = set()
    while next_jti and next_jti not in visited:
        visited.add(next_jti)
        child = (
            await db.execute(
                select(RefreshToken)
                .where(RefreshToken.user_id == user_id)
                .where(RefreshToken.jti == next_jti)
            )
        ).scalar_one_or_none()
        if child is None:
            break
        next_jti = child.replaced_by_jti
        if child.revoked_at is None:
            child.revoked_at = now
            child.revoked_reason = "replay_detected"
            db.add(child)
            revoke_count += 1
    return revoke_count


async def resolve_refresh_session(
    *,
    db: AsyncSession,
    raw_token: str | None,
    settings: Settings,
    current_ip: str | None,
    current_user_agent: str | None,
) -> RefreshSessionResolution:
    payload = token_decode_or_none(raw_token, settings)
    if not payload:
        _emit_failed_refresh_audit(failure_code="invalid_token", detail="Invalid refresh token")
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("invalid_token", failure_code="invalid_token"),
            detail="Invalid refresh token",
        )

    user_id = payload.get("user_id")
    jti = payload.get("jti")
    token_version = payload.get("token_version")
    if not isinstance(user_id, int) or not isinstance(jti, str) or not isinstance(token_version, int):
        _emit_failed_refresh_audit(failure_code="invalid_token", detail="Invalid refresh token")
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("invalid_token", failure_code="invalid_token"),
            detail="Invalid refresh token",
        )

    refresh_row = (
        await db.execute(select(RefreshToken).where(RefreshToken.user_id == user_id).where(RefreshToken.jti == jti))
    ).scalar_one_or_none()
    if refresh_row is None or refresh_row.revoked_at is not None:
        failure_code = "session_not_found"
        revoke_count = 0
        if refresh_row is not None and refresh_row.revoked_reason == "rotated":
            now = utc_now()
            revoke_count = await revoke_rotated_refresh_descendants(
                db=db,
                user_id=user_id,
                replaced_by_jti=refresh_row.replaced_by_jti,
                now=now,
            )
            if revoke_count > 0:
                user = await _load_refresh_user(db, user_id)
                await record_session_audit_plan(
                    db=db,
                    user=user,
                    plan=SessionAuditPlan(
                        event_type=ActivityAction.FAILED_REFRESH.value,
                        failure_code="replay_detected",
                        revoke_count=revoke_count,
                    ),
                )
                await db.commit()
                failure_code = "replay_detected"
        _emit_failed_refresh_audit(
            failure_code=failure_code,
            detail="Refresh session not found",
            user_id=user_id,
        )
        status_value: RefreshStatus = "replay_detected" if revoke_count else "session_not_found"
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome(status_value, failure_code=failure_code),
            detail="Refresh session not found",
            user_id=user_id,
            jti=jti,
        )

    now = utc_now()
    expires_at = coerce_utc(refresh_row.expires_at)
    if expires_at and expires_at <= now:
        revoke_result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == refresh_row.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason="expired")
        )
        revoke_count = int(getattr(revoke_result, "rowcount", 0) or 0)
        if revoke_count > 0:
            user = await _load_refresh_user(db, user_id)
            await record_session_audit_plan(
                db=db,
                user=user,
                plan=SessionAuditPlan(
                    event_type=ActivityAction.FAILED_REFRESH.value,
                    failure_code="expired",
                    revoke_count=revoke_count,
                ),
            )
            await db.commit()
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("expired", failure_code="expired", revoke_count=revoke_count),
            detail="Refresh token expired",
            user_id=user_id,
            jti=jti,
        )
    if expires_at and (expires_at - now).total_seconds() <= SESSION_RENEWAL_MINIMUM_SECONDS:
        revoke_result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == refresh_row.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason="expires_soon")
        )
        revoke_count = int(getattr(revoke_result, "rowcount", 0) or 0)
        if revoke_count > 0:
            user = await _load_refresh_user(db, user_id)
            await record_session_audit_plan(
                db=db,
                user=user,
                plan=SessionAuditPlan(
                    event_type=ActivityAction.FAILED_REFRESH.value,
                    failure_code="expires_soon",
                    revoke_count=revoke_count,
                ),
            )
            await db.commit()
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("expires_soon", failure_code="expires_soon", revoke_count=revoke_count),
            detail="Refresh token expired",
            user_id=user_id,
            jti=jti,
        )

    user = await _load_refresh_user(db, user_id)
    if user is None:
        _emit_failed_refresh_audit(failure_code="unauthorized", detail="Unauthorized", user_id=user_id)
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("session_not_found", failure_code="unauthorized"),
            detail="Unauthorized",
            user_id=user_id,
            jti=jti,
        )
    if not user.is_active:
        await record_session_audit_plan(
            db=db,
            user=user,
            plan=SessionAuditPlan(
                event_type=ActivityAction.FAILED_REFRESH.value,
                failure_code="inactive_user",
                revoke_count=0,
            ),
        )
        await db.commit()
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("inactive_user", failure_code="inactive_user"),
            detail="Unauthorized",
            user=user,
            refresh_row=refresh_row,
            user_id=user_id,
            jti=jti,
        )

    if token_version != user.token_version or refresh_row.token_version != user.token_version:
        revoke_result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == refresh_row.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason="token_version_mismatch")
        )
        revoke_count = int(getattr(revoke_result, "rowcount", 0) or 0)
        if revoke_count > 0:
            await record_session_audit_plan(
                db=db,
                user=user,
                plan=SessionAuditPlan(
                    event_type=ActivityAction.FAILED_REFRESH.value,
                    failure_code="token_version_mismatch",
                    revoke_count=revoke_count,
                ),
            )
            await db.commit()
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome(
                "token_version_mismatch",
                failure_code="token_version_mismatch",
                revoke_count=revoke_count,
            ),
            detail="Session revoked",
            user=user,
            refresh_row=refresh_row,
            user_id=user_id,
            jti=jti,
        )

    context_outcome = refresh_session_context_outcome(
        stored_ip=refresh_row.created_ip,
        current_ip=current_ip,
        stored_user_agent=refresh_row.user_agent,
        current_user_agent=current_user_agent,
    )
    return RefreshSessionResolution(
        outcome=context_outcome,
        detail="OK",
        user=user,
        refresh_row=refresh_row,
        user_id=user_id,
        jti=jti,
        now=now,
        expires_at=expires_at,
        context_outcome=context_outcome,
    )


def sso_session_outcome(
    *,
    now: datetime,
    identity_expires_at,
    settings: Settings,
    renewal_minimum_seconds: int,
) -> SsoSessionOutcome:
    expires_at = coerce_utc(identity_expires_at)
    if expires_at is None:
        return SsoSessionOutcome(
            status="token_expired",
            cookie_plan=SessionCookiePlan(action="clear_refresh"),
            status_code=401,
            detail="SSO token expired",
            code="SSO_TOKEN_EXPIRED",
        )

    session_expires_at = min(now + refresh_token_lifetime(settings), expires_at)
    remaining_lifetime = session_expires_at - now
    if remaining_lifetime.total_seconds() <= renewal_minimum_seconds:
        return SsoSessionOutcome(
            status="token_expired",
            cookie_plan=SessionCookiePlan(action="clear_refresh"),
            audit_plan=SessionAuditPlan(event_type="failed_sso", failure_code="token_lifetime_too_short"),
            session_expires_at=session_expires_at,
            remaining_lifetime=remaining_lifetime,
            status_code=401,
            detail="SSO token expired or near expiry",
            code="SSO_TOKEN_EXPIRED",
        )

    return SsoSessionOutcome(
        status="success",
        cookie_plan=SessionCookiePlan(action="set_refresh"),
        session_expires_at=session_expires_at,
        remaining_lifetime=remaining_lifetime,
    )


def _user_permission_load():
    return user_selectinload_options(include_permissions=True)


async def _log_failed_sso(
    db: AsyncSession,
    *,
    entity_name: str,
    description: str,
) -> None:
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
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
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
        status_code_value = status.HTTP_401_UNAUTHORIZED
        code = "SSO_TOKEN_INVALID"
        if e.code == "tenant_mismatch":
            code = "SSO_TENANT_MISMATCH"
        elif e.code == "email_domain_not_allowed":
            status_code_value = status.HTTP_403_FORBIDDEN
            code = "SSO_EMAIL_DOMAIN_FORBIDDEN"
        elif e.code == "email_required":
            status_code_value = status.HTTP_400_BAD_REQUEST
            code = "SSO_EMAIL_MISSING"
        elif e.code == "missing_token":
            status_code_value = status.HTTP_400_BAD_REQUEST
            code = "SSO_TOKEN_INVALID"
        return None, JSONResponse(status_code=status_code_value, content={"detail": "Invalid SSO token", "code": code})

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


async def _resolve_safe_default_role(db: AsyncSession) -> Role:
    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise HTTPException(status_code=500, detail=f"No safe default role found ({candidates}). Seed roles first.")


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
                status_code=status.HTTP_409_CONFLICT,
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
            status_code=status.HTTP_409_CONFLICT,
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
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "SSO account link required", "code": "SSO_LINK_REQUIRED"},
            )
        email_user.external_id = identity.external_id
        db.add(email_user)
        await db.flush()

    return email_user, None


async def _jit_provision_sso_user(db: AsyncSession, *, identity):
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
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="SSO_CHALLENGE_MISSING",
            detail="SSO login challenge missing or expired.",
        )

    challenge_store = getattr(request.app.state, "sso_challenge_store", None)
    if challenge_store is None:
        return None, JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
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
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="SSO_CHALLENGE_EXPIRED",
            detail="SSO login challenge expired or was already used.",
        )

    if payload.state != challenge.state:
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: state mismatch"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="SSO_STATE_MISMATCH",
            detail="SSO state mismatch.",
        )

    if not identity.nonce:
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: nonce missing"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="SSO_NONCE_MISSING",
            detail="SSO token missing nonce claim.",
        )

    if identity.nonce != challenge.nonce:
        await _log_failed_sso(
            db, entity_name=identity.email or "unknown", description="Failed SSO login: nonce mismatch"
        )
        return None, _challenge_response(
            settings=settings,
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="SSO_NONCE_MISMATCH",
            detail="SSO nonce mismatch.",
        )

    return challenge.return_to, None


async def resolve_sso_start(
    *,
    payload: SsoStartRequest,
    request: Request,
    response: Response,
    settings: Settings,
) -> SsoStartResponse | JSONResponse:
    if settings.auth_mode not in ("microsoft_sso", "hybrid_dev"):
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "SSO is not enabled.", "code": "SSO_DISABLED"},
        )

    challenge_store = getattr(request.app.state, "sso_challenge_store", None)
    if challenge_store is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
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


async def resolve_sso_exchange(
    *,
    payload: SsoExchangeRequest,
    request: Request,
    response: Response,
    db: AsyncSession,
    settings: Settings,
) -> SsoExchangeResolution:
    if settings.auth_mode not in ("microsoft_sso", "hybrid_dev"):
        return SsoExchangeResolution(
            outcome=SsoSessionOutcome(status="blocked", cookie_plan=SessionCookiePlan(action="none")),
            error_response=JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "SSO is not enabled.", "code": "SSO_DISABLED"},
            ),
        )

    identity, error_response = await _verify_sso_identity(payload=payload, settings=settings, db=db)
    if error_response is not None:
        return SsoExchangeResolution(
            outcome=SsoSessionOutcome(status="blocked", cookie_plan=SessionCookiePlan(action="none")),
            error_response=error_response,
        )

    post_login_redirect_to, challenge_error = await _consume_sso_challenge(
        request=request,
        response=response,
        payload=payload,
        identity=identity,
        settings=settings,
        db=db,
    )
    if challenge_error is not None:
        return SsoExchangeResolution(
            outcome=SsoSessionOutcome(status="challenge_expired", cookie_plan=SessionCookiePlan(action="clear_refresh")),
            identity=identity,
            error_response=challenge_error,
        )

    user, resolution_error = await _resolve_sso_user(db, identity=identity, settings=settings)
    if resolution_error is not None:
        return SsoExchangeResolution(
            outcome=SsoSessionOutcome(status="blocked", cookie_plan=SessionCookiePlan(action="none")),
            identity=identity,
            error_response=resolution_error,
        )
    if user is None:
        if not settings.entra_jit_provisioning_enabled:
            await _log_failed_sso(
                db,
                entity_name=identity.email or "unknown",
                description="Failed SSO login: user not provisioned",
            )
            return SsoExchangeResolution(
                outcome=SsoSessionOutcome(status="blocked", cookie_plan=SessionCookiePlan(action="none")),
                identity=identity,
                error_response=JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "User not provisioned", "code": "SSO_USER_NOT_PROVISIONED"},
                ),
            )

        if not identity.email or "@" not in identity.email:
            await _log_failed_sso(
                db,
                entity_name="unknown",
                description="Failed SSO login: missing email claim",
            )
            return SsoExchangeResolution(
                outcome=SsoSessionOutcome(status="blocked", cookie_plan=SessionCookiePlan(action="none")),
                identity=identity,
                error_response=JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={"detail": "Email claim missing", "code": "SSO_EMAIL_MISSING"},
                ),
            )
        user = await _jit_provision_sso_user(db, identity=identity)

    profile_sync_error = await _sync_sso_user_profile(db, user=user, identity=identity)
    if profile_sync_error is not None:
        return SsoExchangeResolution(
            outcome=SsoSessionOutcome(status="blocked", cookie_plan=SessionCookiePlan(action="none")),
            user=user,
            identity=identity,
            error_response=profile_sync_error,
        )

    if not user.is_active:
        return SsoExchangeResolution(
            outcome=SsoSessionOutcome(status="blocked", cookie_plan=SessionCookiePlan(action="none")),
            user=user,
            identity=identity,
            error_response=JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "User account is inactive", "code": "USER_INACTIVE"},
            ),
        )

    now = utc_now()
    outcome = sso_session_outcome(
        now=now,
        identity_expires_at=identity.expires_at,
        settings=settings,
        renewal_minimum_seconds=SESSION_RENEWAL_MINIMUM_SECONDS,
    )
    if outcome.status == "token_expired" and outcome.audit_plan is not None:
        await _log_failed_sso(
            db,
            entity_name=identity.email or "unknown",
            description="Failed SSO login: token lifetime too short for local session",
        )
    if outcome.status == "token_expired":
        return SsoExchangeResolution(
            outcome=outcome,
            user=user,
            identity=identity,
            error_response=JSONResponse(
                status_code=outcome.status_code or status.HTTP_401_UNAUTHORIZED,
                content={"detail": outcome.detail, "code": outcome.code},
            ),
            now=now,
        )

    return SsoExchangeResolution(
        outcome=outcome,
        user=user,
        identity=identity,
        post_login_redirect_to=post_login_redirect_to,
        now=now,
    )
