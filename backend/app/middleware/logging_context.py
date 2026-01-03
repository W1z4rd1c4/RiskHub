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

from app.core.logging import request_id_ctx, user_id_ctx, client_ip_ctx, get_logger


logger = get_logger("middleware.logging")


class LoggingContextMiddleware(BaseHTTPMiddleware):
    """Middleware to inject request context into structlog."""
    
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        
        # Extract client IP (handles X-Forwarded-For for reverse proxies)
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        
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
    Extract user_id from JWT token without full validation.
    
    This is a lightweight extraction for logging purposes only.
    Full validation happens in the auth dependency.
    """
    try:
        from jose import jwt
        from app.core.config import get_settings
        
        settings = get_settings()
        # Decode without verifying signature for speed
        # (full verification happens in auth dependency)
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            options={"verify_signature": False}
        )
        return int(payload.get("sub", 0)) or None
    except Exception:
        return None
