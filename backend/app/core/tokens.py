from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from collections.abc import Iterable
from typing import Any
from uuid import uuid4

import jwt
from jwt import InvalidTokenError
from starlette.requests import Request
from starlette.responses import Response

from app.core.client_ip import resolve_request_client_ip
from app.core.config import Settings

REFRESH_TOKEN_TYPE = "refresh"
REFRESH_SESSION_HINT_COOKIE = "riskhub_refresh_hint"
CSRF_TOKEN_COOKIE = "riskhub_csrf_token"
SSO_CHALLENGE_COOKIE = "riskhub_sso_challenge"


def new_token_jti() -> str:
    return uuid4().hex


def refresh_token_lifetime(settings: Settings) -> timedelta:
    return timedelta(days=max(int(settings.refresh_token_expire_days), 1))


def create_refresh_token(
    *,
    user_id: int,
    token_version: int,
    jti: str,
    settings: Settings,
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + (expires_delta or refresh_token_lifetime(settings))
    payload: dict[str, Any] = {
        "type": REFRESH_TOKEN_TYPE,
        "user_id": user_id,
        "token_version": token_version,
        "jti": jti,
        "exp": expires_at,
    }
    encoded = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    return encoded, expires_at


def decode_refresh_token(token: str, settings: Settings) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def get_refresh_cookie_name(settings: Settings) -> str:
    return settings.refresh_cookie_name or "riskhub_refresh_token"


def get_refresh_session_hint_cookie_name() -> str:
    return REFRESH_SESSION_HINT_COOKIE


def get_csrf_cookie_name() -> str:
    return CSRF_TOKEN_COOKIE


def get_sso_challenge_cookie_name() -> str:
    return SSO_CHALLENGE_COOKIE


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_refresh_session_hint_cookie(response: Response, settings: Settings, *, max_age: int | None = None) -> None:
    cookie_max_age = max_age if max_age is not None else int(refresh_token_lifetime(settings).total_seconds())
    response.set_cookie(
        key=get_refresh_session_hint_cookie_name(),
        value="1",
        max_age=cookie_max_age,
        httponly=False,
        secure=not settings.debug,
        samesite=settings.refresh_cookie_samesite,
        domain=settings.refresh_cookie_domain,
        path="/",
    )


def set_csrf_cookie(
    response: Response,
    settings: Settings,
    token: str | None = None,
    *,
    max_age: int | None = None,
) -> str:
    csrf_token = token or new_csrf_token()
    cookie_max_age = max_age if max_age is not None else int(refresh_token_lifetime(settings).total_seconds())
    response.set_cookie(
        key=get_csrf_cookie_name(),
        value=csrf_token,
        max_age=cookie_max_age,
        httponly=False,
        secure=not settings.debug,
        samesite=settings.refresh_cookie_samesite,
        domain=settings.refresh_cookie_domain,
        path="/",
    )
    return csrf_token


def set_refresh_cookie(response: Response, token: str, settings: Settings, *, max_age: int | None = None) -> None:
    cookie_max_age = max_age if max_age is not None else int(refresh_token_lifetime(settings).total_seconds())
    response.set_cookie(
        key=get_refresh_cookie_name(settings),
        value=token,
        max_age=cookie_max_age,
        httponly=True,
        secure=not settings.debug,
        samesite=settings.refresh_cookie_samesite,
        domain=settings.refresh_cookie_domain,
        path="/api/v1/auth",
    )
    set_refresh_session_hint_cookie(response, settings, max_age=cookie_max_age)


def set_sso_challenge_cookie(response: Response, challenge_id: str, settings: Settings, *, max_age: int) -> None:
    response.set_cookie(
        key=get_sso_challenge_cookie_name(),
        value=challenge_id,
        max_age=max_age,
        httponly=True,
        secure=not settings.debug,
        samesite=settings.refresh_cookie_samesite,
        domain=settings.refresh_cookie_domain,
        path="/api/v1/auth",
    )


def clear_csrf_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=get_csrf_cookie_name(),
        domain=settings.refresh_cookie_domain,
        path="/",
    )


def clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=get_refresh_cookie_name(settings),
        domain=settings.refresh_cookie_domain,
        path="/api/v1/auth",
    )
    response.delete_cookie(
        key=get_refresh_session_hint_cookie_name(),
        domain=settings.refresh_cookie_domain,
        path="/",
    )
    clear_csrf_cookie(response, settings)


def clear_sso_challenge_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=get_sso_challenge_cookie_name(),
        domain=settings.refresh_cookie_domain,
        path="/api/v1/auth",
    )


def get_refresh_cookie(request: Request, settings: Settings) -> str | None:
    return request.cookies.get(get_refresh_cookie_name(settings))


def get_csrf_cookie(request: Request) -> str | None:
    return request.cookies.get(get_csrf_cookie_name())


def get_sso_challenge_cookie(request: Request) -> str | None:
    return request.cookies.get(get_sso_challenge_cookie_name())


def token_decode_or_none(token: str | None, settings: Settings) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        payload = decode_refresh_token(token, settings)
    except InvalidTokenError:
        return None
    if payload.get("type") != REFRESH_TOKEN_TYPE:
        return None
    return payload


def get_request_client_ip(request: Request, trusted_proxies: Iterable[str] | None = None) -> str | None:
    return resolve_request_client_ip(request, trusted_proxies)


def get_request_user_agent(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    if not ua:
        return None
    return ua[:512]
