"""
Security middleware for production hardening.

This middleware implements:
1. Security headers (CSP, HSTS, X-Frame-Options, etc.)
2. Rate limiting for sensitive endpoints
3. Account lockout after failed login attempts
"""
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, Tuple
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("middleware.security")


@dataclass
class RateLimitState:
    """Tracks rate limit state for an IP/endpoint combination."""
    requests: list = field(default_factory=list)
    blocked_until: float = 0.0
    last_seen: float = 0.0  # For TTL-based eviction


@dataclass
class LoginAttemptState:
    """Tracks failed login attempts for an account."""
    failed_attempts: int = 0
    locked_until: float = 0.0
    last_attempt: float = 0.0


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
        self.settings = get_settings()
    
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        
        # Security headers for all responses
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
        )
        
        # HSTS only in production (requires HTTPS)
        if self.enable_hsts and not self.settings.debug:
            # max-age=31536000 = 1 year, includeSubDomains for comprehensive coverage
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        
        # Content Security Policy - tighter in production
        if self.settings.debug:
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
                "script-src 'self' 'unsafe-inline'",  # React prod build doesn't need eval
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


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware for API endpoints.
    
    Implements sliding window rate limiting with configurable limits
    per endpoint pattern.
    """
    
    DEFAULT_LIMITS = {
        "/api/v1/auth/login": (5, 60),        # 5 attempts per minute
        "/api/v1/auth/demo-login": (10, 60),  # 10 demo logins per minute
        "/api/v1/users": (100, 60),           # 100 requests per minute
        "default": (200, 60),                 # 200 requests per minute for other endpoints
    }
    
    # Trusted proxy CIDRs - only trust XFF from these sources
    # Configure via environment or override in production
    TRUSTED_PROXIES = {
        "127.0.0.1",      # Loopback
        "::1",            # IPv6 loopback
        "10.0.0.0/8",     # Private networks (Docker, K8s)
        "172.16.0.0/12",
        "192.168.0.0/16",
    }
    
    # Memory bounds
    MAX_STATE_KEYS = 10000  # Maximum unique IP:path combinations
    STATE_TTL_SECONDS = 600  # Evict entries not seen in 10 minutes
    
    def __init__(
        self, 
        app, 
        limits: Dict[str, Tuple[int, int]] | None = None,
        enabled: bool = True,
        trusted_proxies: set[str] | None = None
    ):
        super().__init__(app)
        self.limits = limits or self.DEFAULT_LIMITS
        self.enabled = enabled
        self.state: Dict[str, RateLimitState] = {}
        self.settings = get_settings()
        self.trusted_proxies = trusted_proxies or self.TRUSTED_PROXIES
        self._last_eviction = time.time()
    
    def _is_trusted_proxy(self, ip: str) -> bool:
        """Check if an IP is in the trusted proxy list."""
        # Simple string match for now (could use ipaddress module for CIDR)
        for trusted in self.trusted_proxies:
            if ip == trusted or (ip.startswith(trusted.split('/')[0]) if '/' in trusted else False):
                return True
        return False
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, only trusting XFF from trusted proxies."""
        peer_ip = request.client.host if request.client else "unknown"
        
        # Only trust X-Forwarded-For if request comes from trusted proxy
        if not self._is_trusted_proxy(peer_ip):
            return peer_ip
        
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return peer_ip
    
    def _get_limit_for_path(self, path: str) -> Tuple[int, int]:
        """Get rate limit for a path, falling back to default."""
        for pattern, limit in self.limits.items():
            if pattern != "default" and path.startswith(pattern):
                return limit
        return self.limits.get("default", (200, 60))
    
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
        # Skip rate limiting in debug mode or if disabled
        if not self.enabled or self.settings.debug:
            return await call_next(request)
        
        now = time.time()
        
        # Periodically evict stale entries to bound memory
        self._evict_stale_entries(now)
        
        client_ip = self._get_client_ip(request)
        path = request.url.path
        max_requests, window = self._get_limit_for_path(path)
        
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


class AccountLockoutMiddleware:
    """
    Account lockout tracking for failed login attempts.
    
    This is not a traditional middleware but a utility class used by
    the login endpoint to track and enforce account lockouts.
    """
    
    # Lockout configuration
    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_DURATION_SECONDS = 900  # 15 minutes
    ATTEMPT_WINDOW_SECONDS = 600    # 10 minutes - failed attempts expire after this
    
    def __init__(self):
        self.accounts: Dict[str, LoginAttemptState] = defaultdict(LoginAttemptState)
    
    def is_locked(self, identifier: str) -> Tuple[bool, int]:
        """
        Check if an account is locked.
        
        Args:
            identifier: Email or username
            
        Returns:
            Tuple of (is_locked, seconds_remaining)
        """
        state = self.accounts.get(identifier)
        if not state:
            return False, 0
        
        now = time.time()
        if state.locked_until > now:
            return True, int(state.locked_until - now)
        
        return False, 0
    
    def record_failed_attempt(self, identifier: str) -> Tuple[bool, int]:
        """
        Record a failed login attempt.
        
        Args:
            identifier: Email or username
            
        Returns:
            Tuple of (is_now_locked, lockout_seconds if locked else attempts_remaining)
        """
        state = self.accounts[identifier]
        now = time.time()
        
        # Reset if last attempt was outside the window
        if state.last_attempt and (now - state.last_attempt) > self.ATTEMPT_WINDOW_SECONDS:
            state.failed_attempts = 0
        
        state.failed_attempts += 1
        state.last_attempt = now
        
        if state.failed_attempts >= self.MAX_FAILED_ATTEMPTS:
            state.locked_until = now + self.LOCKOUT_DURATION_SECONDS
            logger.warning(
                "account_locked",
                identifier=identifier,
                failed_attempts=state.failed_attempts,
                lockout_seconds=self.LOCKOUT_DURATION_SECONDS
            )
            return True, self.LOCKOUT_DURATION_SECONDS
        
        attempts_remaining = self.MAX_FAILED_ATTEMPTS - state.failed_attempts
        return False, attempts_remaining
    
    def record_successful_login(self, identifier: str):
        """Clear failed attempts after successful login."""
        if identifier in self.accounts:
            del self.accounts[identifier]


# Global instance for account lockout tracking
account_lockout = AccountLockoutMiddleware()
