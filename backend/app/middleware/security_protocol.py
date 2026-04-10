"""Protocol-level API request hardening middleware."""

from urllib.parse import parse_qs

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings


class ProtocolGuardMiddleware(BaseHTTPMiddleware):
    """
    Lightweight request protocol hardening.

    Guards currently implemented:
    - Reject method override headers for API routes.
    - Reject duplicate values for sensitive query keys.
    - Enforce JSON content type for security-sensitive POST/PUT/PATCH prefixes.
    """

    METHOD_OVERRIDE_HEADERS = (
        "x-http-method-override",
        "x-method-override",
        "x-http-method",
    )

    def __init__(self, app):
        super().__init__(app)
        self._default_settings = get_settings()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        settings = getattr(request.app.state, "settings", self._default_settings)
        if not getattr(settings, "protocol_guard_enabled", True):
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        if getattr(settings, "protocol_guard_block_method_override", True):
            for header in self.METHOD_OVERRIDE_HEADERS:
                if request.headers.get(header):
                    return JSONResponse(
                        status_code=400,
                        content={
                            "detail": "Method override headers are not allowed.",
                            "code": "method_override_not_allowed",
                        },
                    )

        sensitive_keys = {
            key for key in getattr(settings, "protocol_guard_sensitive_query_keys", []) if isinstance(key, str) and key
        }
        if sensitive_keys and request.url.query:
            parsed = parse_qs(request.url.query, keep_blank_values=True)
            for key in sensitive_keys:
                values = parsed.get(key)
                if values and len(values) > 1:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "detail": f"Duplicate query parameter is not allowed: {key}",
                            "code": "duplicate_query_parameter",
                        },
                    )

        if request.method in {"POST", "PUT", "PATCH"}:
            guarded_prefixes = tuple(
                p for p in getattr(settings, "protocol_guard_json_prefixes", []) if isinstance(p, str) and p
            )
            if guarded_prefixes and any(path.startswith(prefix) for prefix in guarded_prefixes):
                content_length = request.headers.get("content-length")
                has_body = content_length is None or content_length.strip() != "0"
                if has_body:
                    content_type = (request.headers.get("content-type") or "").lower()
                    if "application/json" not in content_type:
                        return JSONResponse(
                            status_code=415,
                            content={
                                "detail": "Content-Type must be application/json.",
                                "code": "unsupported_content_type",
                            },
                        )

        return await call_next(request)
