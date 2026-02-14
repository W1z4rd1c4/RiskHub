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

from app.core.logging import client_ip_ctx, get_logger, request_id_ctx, user_id_ctx

logger = get_logger("middleware.logging")


class LoggingContextMiddleware(BaseHTTPMiddleware):
    """Middleware to inject request context into structlog."""
    
    # Simple trusted proxy check for logging (rate limiting uses full CIDR in security.py)
    # These are private networks where XFF can be trusted
    TRUSTED_PREFIXES = ("127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
                        "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                        "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
                        "172.30.", "172.31.", "192.168.", "::1")
    
    def _is_trusted_proxy(self, ip: str) -> bool:
        """Quick check if IP is from a trusted internal network."""
        return ip.startswith(self.TRUSTED_PREFIXES)
    
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        
        # Extract client IP - only trust XFF from internal/trusted proxies
        peer_ip = request.client.host if request.client else "unknown"
        if self._is_trusted_proxy(peer_ip):
            # Trusted proxy - use XFF if present
            xff = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            client_ip = xff if xff else peer_ip
        else:
            # Untrusted source - don't trust XFF (prevents spoofing)
            client_ip = peer_ip
        
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
        from jose import JWTError, jwt

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
    except (JWTError, ValueError, TypeError):
        # Invalid/expired token - no user attribution
        return None
    except Exception:
        return None
