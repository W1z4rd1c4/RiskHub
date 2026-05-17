from __future__ import annotations

import secrets
from urllib.parse import urlsplit

from fastapi.responses import JSONResponse
from starlette.requests import Request

from app.core.config import Settings
from app.core.tokens import get_csrf_cookie

CSRF_HEADER_NAME = "X-CSRF-Token"


def _forbidden(code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=403, content={"code": code, "detail": detail})


def _normalize_origin(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.netloc or not parsed.hostname:
        return None

    scheme = parsed.scheme.lower()
    hostname = parsed.hostname.lower()
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"

    try:
        port = parsed.port
    except ValueError:
        return None

    default_port = (scheme == "http" and port in (None, 80)) or (scheme == "https" and port in (None, 443))
    netloc = hostname if default_port or port is None else f"{hostname}:{port}"
    return f"{scheme}://{netloc}"


def _allowed_origins(settings: Settings) -> set[str]:
    return {
        normalized_origin
        for origin in settings.cors_origins
        if (normalized_origin := _normalize_origin(origin)) is not None
    }


def validate_request_origin(request: Request, settings: Settings) -> JSONResponse | None:
    allowed_origins = _allowed_origins(settings)
    request_origin = _normalize_origin(request.headers.get("origin"))
    if request_origin is None:
        request_origin = _normalize_origin(request.headers.get("referer"))
    if request_origin is None or request_origin not in allowed_origins:
        return _forbidden("origin_not_allowed", "Request origin is not allowed.")
    return None


def validate_csrf(request: Request) -> JSONResponse | None:
    header_value = request.headers.get(CSRF_HEADER_NAME)
    cookie_value = get_csrf_cookie(request)
    if not header_value or not cookie_value or not secrets.compare_digest(header_value, cookie_value):
        return _forbidden("csrf_validation_failed", "CSRF validation failed.")
    return None
