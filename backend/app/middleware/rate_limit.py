from __future__ import annotations

import math
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Tuple

from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES, ClientIPResolver, resolve_request_client_ip
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("middleware.security")


@dataclass
class RateLimitState:
    """Tracks rate limit state for an IP/endpoint combination."""

    requests: list = field(default_factory=list)
    blocked_until: float = 0.0
    last_seen: float = 0.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware for API endpoints.

    Implements sliding window rate limiting with configurable limits
    per endpoint pattern.
    """

    DEFAULT_LIMITS = {
        "/api/v1/auth/config": (60, 60),
        "/api/v1/auth/login": (5, 60),
        "/api/v1/auth/sso": (10, 60),
        "/api/v1/auth/demo-login": (10, 60),
        "/api/v1/users": (100, 60),
        "default": (200, 60),
    }

    TRUSTED_PROXIES = set(DEFAULT_TRUSTED_PROXIES)
    MAX_STATE_KEYS = 10000
    STATE_TTL_SECONDS = 600

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
        self.trusted_proxies = (
            list(trusted_proxies) if trusted_proxies is not None else list(self.TRUSTED_PROXIES)
        )
        self._client_ip_resolver = ClientIPResolver(self.trusted_proxies)
        self._last_eviction = time.time()
        self._default_settings = get_settings()

    def _is_trusted_proxy(self, ip_str: str) -> bool:
        return self._client_ip_resolver.is_trusted_proxy(ip_str)

    def _get_client_ip(self, request: Request) -> str:
        return resolve_request_client_ip(request, self._client_ip_resolver.trusted_proxies)

    def _get_limit_for_path(self, path: str) -> Tuple[int, int]:
        for pattern, limit in self.limits.items():
            if pattern != "default" and path.startswith(pattern):
                return limit
        return self.limits.get("default", (200, 60))

    def _is_fail_closed_path(self, *, request: Request, path: str) -> bool:
        settings = getattr(request.app.state, "settings", self._default_settings)
        prefixes = settings.redis.rate_limit_fail_closed_prefixes
        for prefix in prefixes:
            if isinstance(prefix, str) and prefix and path.startswith(prefix):
                return True
        return False

    def _clean_old_requests(self, state: RateLimitState, window: int, now: float):
        cutoff = now - window
        state.requests = [ts for ts in state.requests if ts > cutoff]

    def _evict_stale_entries(self, now: float):
        if now - self._last_eviction < 60:
            return
        self._last_eviction = now

        cutoff = now - self.STATE_TTL_SECONDS
        stale_keys = [k for k, v in self.state.items() if v.last_seen < cutoff]
        for key in stale_keys:
            del self.state[key]

        if len(self.state) > self.MAX_STATE_KEYS:
            sorted_keys = sorted(self.state.keys(), key=lambda k: self.state[k].last_seen)
            for key in sorted_keys[: len(self.state) - self.MAX_STATE_KEYS]:
                del self.state[key]

        if stale_keys:
            logger.debug("rate_limit_eviction", evicted=len(stale_keys), remaining=len(self.state))

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not self.enabled:
            return await call_next(request)

        now = time.time()
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
            except (RedisError, TimeoutError, OSError, RuntimeError) as exc:
                logger.warning("rate_limit_redis_error", client_ip=client_ip, path=path, error=str(exc))
                if self._is_fail_closed_path(request=request, path=path):
                    return JSONResponse(
                        status_code=503,
                        content={
                            "detail": "Rate limiting backend temporarily unavailable. Please retry.",
                            "code": "rate_limit_backend_unavailable",
                        },
                        headers={"Retry-After": "5"},
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
        key = f"{client_ip}:{path}"
        if key not in self.state:
            self.state[key] = RateLimitState()
        state = self.state[key]
        state.last_seen = now
        self._clean_old_requests(state, window, now)

        if state.blocked_until > now:
            retry_after = max(0, math.ceil(state.blocked_until - now))
            logger.warning(
                "rate_limit_blocked",
                client_ip=client_ip,
                path=path,
                retry_after=retry_after,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        if len(state.requests) >= max_requests:
            oldest_request = min(state.requests)
            state.blocked_until = oldest_request + window
            retry_after = max(0, math.ceil(state.blocked_until - now))
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
