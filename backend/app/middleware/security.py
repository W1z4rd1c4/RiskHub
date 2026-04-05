"""
Compatibility facade for production hardening middleware.

Public imports remain stable from this module while the implementations live in
focused header and rate-limit helpers.
"""

from app.middleware.rate_limit import RateLimitMiddleware, RateLimitState
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.security_protocol import ProtocolGuardMiddleware

__all__ = ["RateLimitState", "SecurityHeadersMiddleware", "ProtocolGuardMiddleware", "RateLimitMiddleware"]
