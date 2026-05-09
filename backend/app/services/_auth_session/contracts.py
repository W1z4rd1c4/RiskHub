from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from app.core.config import Settings
from app.core.datetime_utils import coerce_utc
from app.core.tokens import refresh_token_lifetime
from app.models import RefreshToken, User
from app.services.sso_token_service import VerifiedIdentity

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
class SsoFailure:
    status_code: int
    detail: str
    code: str
    clear_challenge_cookie: bool = False


@dataclass(frozen=True)
class SsoStartResolution:
    response: object | None = None
    failure: SsoFailure | None = None
    challenge_id: str | None = None
    max_age: int | None = None

    @property
    def is_authorized(self) -> bool:
        return self.failure is None and self.response is not None


@dataclass(frozen=True)
class SsoExchangeResolution:
    outcome: SsoSessionOutcome
    user: User | None = None
    identity: VerifiedIdentity | None = None
    post_login_redirect_to: str | None = None
    failure: SsoFailure | None = None
    clear_challenge_cookie: bool = False
    now: datetime | None = None

    @property
    def is_authorized(self) -> bool:
        return self.failure is None and self.user is not None and self.outcome.status == "success"


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
