"""
Logging context middleware for request tracking.

This middleware:
1. Generates or extracts X-Request-ID header for request tracing
2. Binds request_id, client_ip to structlog context
3. Extracts user_id from JWT token if authenticated

All downstream loggers automatically include this context.
"""
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES, ClientIPResolver
from app.core.logging import client_ip_ctx, get_logger, request_id_ctx, user_id_ctx

logger = get_logger("middleware.logging")


class LoggingContextMiddleware(BaseHTTPMiddleware):
    """Middleware to inject request context into structlog."""

    TRUSTED_PROXIES = set(DEFAULT_TRUSTED_PROXIES)

    def __init__(
        self,
        app,
        trusted_proxies: list[str] | set[str] | tuple[str, ...] | None = None,
    ):
        super().__init__(app)
        proxy_entries = list(trusted_proxies) if trusted_proxies is not None else list(self.TRUSTED_PROXIES)
        self._client_ip_resolver = ClientIPResolver(proxy_entries)

    def _get_client_ip(self, request: Request) -> str:
        """Resolve effective client IP using trusted-proxy chain semantics."""
        peer_ip = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("X-Forwarded-For")
        return self._client_ip_resolver.resolve(peer_ip=peer_ip, forwarded_for=forwarded)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

        # Extract client IP using the same trusted proxy logic as rate limiting.
        client_ip = self._get_client_ip(request)

        # Set context variables for the duration of this request
        request_id_token = request_id_ctx.set(request_id)
        client_ip_token = client_ip_ctx.set(client_ip)
        user_id_token = None

        try:
            # Try to extract user_id from JWT token
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                user_id = _extract_user_id_from_token(token)
                if user_id:
                    user_id_token = user_id_ctx.set(user_id)

            # Log request start
            logger.info(
                "request_started",
                method=request.method,
                path=str(request.url.path),
                query=str(request.url.query) if request.url.query else None,
            )

            # Process request
            response = await call_next(request)

            # Log request completion
            logger.info(
                "request_completed",
                method=request.method,
                path=str(request.url.path),
                status_code=response.status_code,
            )

            # Add request ID to response headers for tracing
            response.headers["X-Request-ID"] = request_id

            return response

        except Exception as e:
            logger.error(
                "request_error",
                method=request.method,
                path=str(request.url.path),
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
        finally:
            # Reset context variables
            request_id_ctx.reset(request_id_token)
            client_ip_ctx.reset(client_ip_token)
            if user_id_token:
                user_id_ctx.reset(user_id_token)


def _extract_user_id_from_token(token: str) -> int | None:
    """
    Extract user_id from JWT token with signature verification.

    This validates the JWT before trusting the user_id for logging context.
    Invalid/expired tokens return None (no attribution).
    """
    try:
        import jwt
        from jwt import InvalidTokenError

        from app.core.config import get_settings

        settings = get_settings()
        # Verify signature to prevent spoofed attribution
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            options={"verify_exp": True, "verify_signature": True}
        )
        # Token encodes user_id as dedicated claim, sub is email
        user_id = payload.get("user_id")
        if user_id is not None:
            return int(user_id)
        return None
    except (InvalidTokenError, ValueError, TypeError):
        # Invalid/expired token - no user attribution
        return None
    except Exception:
        return None
