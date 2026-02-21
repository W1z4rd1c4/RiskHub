"""
Security middleware for production hardening.

This middleware implements:
1. Security headers (CSP, HSTS, X-Frame-Options, etc.)
2. Rate limiting for sensitive endpoints
"""
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Tuple
from urllib.parse import parse_qs

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES, ClientIPResolver
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("middleware.security")


@dataclass
class RateLimitState:
    """Tracks rate limit state for an IP/endpoint combination."""
    requests: list = field(default_factory=list)
    blocked_until: float = 0.0
    last_seen: float = 0.0  # For TTL-based eviction


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.

    Headers added:
    - X-Frame-Options: Prevents clickjacking
    - X-Content-Type-Options: Prevents MIME type sniffing
    - X-XSS-Protection: Legacy XSS filter
    - Strict-Transport-Security: Forces HTTPS
    - Referrer-Policy: Controls referrer information
    - Content-Security-Policy: Restricts resource loading
    - Permissions-Policy: Controls browser features
    """

    def __init__(self, app, enable_hsts: bool = True, csp_report_uri: str | None = None):
        super().__init__(app)
        self.enable_hsts = enable_hsts
        self.csp_report_uri = csp_report_uri
        self._default_settings = get_settings()

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        settings = getattr(request.app.state, "settings", self._default_settings)

        # Security headers for all responses
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
        )

        # HSTS only in production (requires HTTPS)
        if self.enable_hsts and not settings.debug:
            # max-age=31536000 = 1 year, includeSubDomains for comprehensive coverage
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        # Content Security Policy - tighter in production
        if settings.debug:
            # Development: permissive for HMR, dev tools
            csp_directives = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  # React HMR needs this
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data: https: blob:",
                "connect-src 'self' http://localhost:* https://*",  # Dev servers
                "frame-ancestors 'none'",
                "form-action 'self'",
                "base-uri 'self'",
                "object-src 'none'",
            ]
        else:
            # Production: tight CSP (no unsafe-eval, restricted connect-src)
            csp_directives = [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data: https: blob:",
                "connect-src 'self'",  # Only same-origin API calls
                "frame-ancestors 'none'",
                "form-action 'self'",
                "base-uri 'self'",
                "object-src 'none'",
                "upgrade-insecure-requests",  # Force HTTPS for all resources
            ]

        if self.csp_report_uri:
            csp_directives.append(f"report-uri {self.csp_report_uri}")

        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)

        return response


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

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
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


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware for API endpoints.

    Implements sliding window rate limiting with configurable limits
    per endpoint pattern.
    """

    DEFAULT_LIMITS = {
        "/api/v1/auth/config": (60, 60),       # 60 config reads per minute
        "/api/v1/auth/login": (5, 60),        # 5 attempts per minute
        "/api/v1/auth/sso": (10, 60),         # 10 SSO exchanges per minute
        "/api/v1/auth/demo-login": (10, 60),  # 10 demo logins per minute
        "/api/v1/users": (100, 60),           # 100 requests per minute
        "default": (200, 60),                 # 200 requests per minute for other endpoints
    }

    # Trusted proxy CIDRs - only trust XFF from these sources
    TRUSTED_PROXIES = set(DEFAULT_TRUSTED_PROXIES)

    # Memory bounds
    MAX_STATE_KEYS = 10000  # Maximum unique IP:path combinations
    STATE_TTL_SECONDS = 600  # Evict entries not seen in 10 minutes

    _REDIS_LUA = """
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local member = ARGV[2]
    local window = tonumber(ARGV[3])
    local limit = tonumber(ARGV[4])
    local expire = tonumber(ARGV[5])

    redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
    local count = redis.call('ZCARD', key)
    if count >= limit then
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local oldestTs = tonumber(oldest[2])
      local retry = math.ceil((oldestTs + window - now) / 1000)
      if retry < 0 then retry = 0 end
      return {0, retry}
    end

    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, expire)
    return {1, 0}
    """

    def __init__(
        self,
        app,
        limits: Dict[str, Tuple[int, int]] | None = None,
        enabled: bool = True,
        trusted_proxies: list[str] | set[str] | tuple[str, ...] | None = None,
        redis_key_prefix: str = "riskhub:rl",
    ):
        super().__init__(app)
        self.limits = limits or self.DEFAULT_LIMITS
        self.enabled = enabled
        self.redis_key_prefix = redis_key_prefix
        self.state: Dict[str, RateLimitState] = {}
        self.trusted_proxies = list(trusted_proxies) if trusted_proxies is not None else list(self.TRUSTED_PROXIES)
        self._client_ip_resolver = ClientIPResolver(self.trusted_proxies)
        self._last_eviction = time.time()
        self._default_settings = get_settings()

    def _is_trusted_proxy(self, ip_str: str) -> bool:
        """Check whether `ip_str` belongs to a trusted proxy network."""
        return self._client_ip_resolver.is_trusted_proxy(ip_str)

    def _get_client_ip(self, request: Request) -> str:
        """Resolve effective client IP using trusted-proxy chain semantics."""
        peer_ip = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("X-Forwarded-For")
        return self._client_ip_resolver.resolve(peer_ip=peer_ip, forwarded_for=forwarded)

    def _get_limit_for_path(self, path: str) -> Tuple[int, int]:
        """Get rate limit for a path, falling back to default."""
        for pattern, limit in self.limits.items():
            if pattern != "default" and path.startswith(pattern):
                return limit
        return self.limits.get("default", (200, 60))

    def _is_fail_closed_path(self, *, request: Request, path: str) -> bool:
        settings = getattr(request.app.state, "settings", self._default_settings)
        prefixes = getattr(settings, "rate_limit_fail_closed_prefixes", ()) or ()
        for prefix in prefixes:
            if isinstance(prefix, str) and prefix and path.startswith(prefix):
                return True
        return False

    def _clean_old_requests(self, state: RateLimitState, window: int, now: float):
        """Remove requests outside the sliding window."""
        cutoff = now - window
        state.requests = [ts for ts in state.requests if ts > cutoff]

    def _evict_stale_entries(self, now: float):
        """Remove stale entries to bound memory growth."""
        # Only run eviction every 60 seconds to avoid overhead
        if now - self._last_eviction < 60:
            return
        self._last_eviction = now

        cutoff = now - self.STATE_TTL_SECONDS
        stale_keys = [k for k, v in self.state.items() if v.last_seen < cutoff]
        for key in stale_keys:
            del self.state[key]

        # If still over limit, evict oldest entries
        if len(self.state) > self.MAX_STATE_KEYS:
            sorted_keys = sorted(self.state.keys(), key=lambda k: self.state[k].last_seen)
            for key in sorted_keys[:len(self.state) - self.MAX_STATE_KEYS]:
                del self.state[key]

        if stale_keys:
            logger.debug("rate_limit_eviction", evicted=len(stale_keys), remaining=len(self.state))

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip rate limiting if disabled (debug mode disables it in app setup)
        if not self.enabled:
            return await call_next(request)

        now = time.time()

        # Periodically evict stale entries to bound memory
        self._evict_stale_entries(now)

        client_ip = self._get_client_ip(request)
        path = request.url.path
        max_requests, window = self._get_limit_for_path(path)

        redis = getattr(request.app.state, "redis", None)
        if redis is not None:
            try:
                allowed, retry_after = await self._check_redis(
                    redis=redis,
                    client_ip=client_ip,
                    path=path,
                    max_requests=max_requests,
                    window_seconds=window,
                )
                if not allowed:
                    logger.warning(
                        "rate_limit_exceeded",
                        client_ip=client_ip,
                        path=path,
                        limit=max_requests,
                        window=window,
                    )
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": "Too many requests. Please try again later.",
                            "retry_after": retry_after,
                        },
                        headers={"Retry-After": str(retry_after)},
                    )
                return await call_next(request)
            except Exception as e:
                logger.warning("rate_limit_redis_error", client_ip=client_ip, path=path, error=str(e))
                if self._is_fail_closed_path(request=request, path=path):
                    return JSONResponse(
                        status_code=503,
                        content={
                            "detail": "Rate limiting backend temporarily unavailable. Please retry.",
                            "code": "rate_limit_backend_unavailable",
                        },
                        headers={"Retry-After": "5"},
                    )
                # Non-sensitive routes fall back to bounded in-memory throttling.
                return await self._dispatch_in_memory(
                    request=request,
                    call_next=call_next,
                    client_ip=client_ip,
                    path=path,
                    max_requests=max_requests,
                    window=window,
                    now=now,
                )

        return await self._dispatch_in_memory(
            request=request,
            call_next=call_next,
            client_ip=client_ip,
            path=path,
            max_requests=max_requests,
            window=window,
            now=now,
        )

    async def _dispatch_in_memory(
        self,
        *,
        request: Request,
        call_next: RequestResponseEndpoint,
        client_ip: str,
        path: str,
        max_requests: int,
        window: int,
        now: float,
    ) -> Response:
        # Create unique key for IP + endpoint
        key = f"{client_ip}:{path}"

        # Get or create state (plain dict, not defaultdict)
        if key not in self.state:
            self.state[key] = RateLimitState()
        state = self.state[key]
        state.last_seen = now  # Update for TTL tracking

        # Check if currently blocked
        if state.blocked_until > now:
            retry_after = int(state.blocked_until - now)
            logger.warning(
                "rate_limit_blocked",
                client_ip=client_ip,
                path=path,
                retry_after=retry_after
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": retry_after
                },
                headers={"Retry-After": str(retry_after)}
            )

        # Clean old requests and check limit
        self._clean_old_requests(state, window, now)

        if len(state.requests) >= max_requests:
            # Block for remaining window time
            state.blocked_until = now + window
            logger.warning(
                "rate_limit_exceeded",
                client_ip=client_ip,
                path=path,
                limit=max_requests,
                window=window
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": window
                },
                headers={"Retry-After": str(window)}
            )

        # Record this request
        state.requests.append(now)

        return await call_next(request)

    async def _check_redis(
        self,
        *,
        redis,
        client_ip: str,
        path: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        now_ms = int(time.time() * 1000)
        window_ms = int(window_seconds * 1000)
        expire_seconds = int(window_seconds + 5)
        member = f"{now_ms}:{uuid.uuid4().hex}"
        key = f"{self.redis_key_prefix}:{client_ip}:{path}"

        allowed, retry_after = await redis.eval(
            self._REDIS_LUA,
            1,
            key,
            now_ms,
            member,
            window_ms,
            max_requests,
            expire_seconds,
        )
        return bool(allowed), int(retry_after)
