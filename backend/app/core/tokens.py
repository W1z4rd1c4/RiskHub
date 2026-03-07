from __future__ import annotations

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


def set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    max_age = int(refresh_token_lifetime(settings).total_seconds())
    response.set_cookie(
        key=get_refresh_cookie_name(settings),
        value=token,
        max_age=max_age,
        httponly=True,
        secure=not settings.debug,
        samesite=settings.refresh_cookie_samesite,
        domain=settings.refresh_cookie_domain,
        path="/api/v1/auth",
    )


def clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=get_refresh_cookie_name(settings),
        domain=settings.refresh_cookie_domain,
        path="/api/v1/auth",
    )


def get_refresh_cookie(request: Request, settings: Settings) -> str | None:
    return request.cookies.get(get_refresh_cookie_name(settings))


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
