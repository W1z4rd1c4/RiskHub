from __future__ import annotations

import time
from collections.abc import Mapping

from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES, ClientIPResolver, resolve_request_client_ip
from app.core.config import get_settings
from app.core.logging import get_logger
from app.middleware.rate_limit.backend import InMemoryRateLimitBackend, RateLimitState, RedisRateLimitBackend
from app.middleware.rate_limit.policy import RateLimitRule, get_limit_for_path, resolve_rate_limit_rules
from app.middleware.rate_limit.responses import (
    build_rate_limit_backend_unavailable_response,
    build_rate_limit_response,
)

logger = get_logger("middleware.security")

try:
    from prometheus_client import Counter
except ModuleNotFoundError:  # pragma: no cover - metrics dependency is optional in tests
    Counter = None


class _NoopCounter:
    def inc(self, amount: int = 1) -> None:  # noqa: ARG002
        return None


RATE_LIMIT_BACKEND_UNAVAILABLE_TOTAL = (
    Counter(
        "riskhub_rate_limit_backend_unavailable_total",
        "Number of requests rejected or degraded because the rate-limit backend was unavailable.",
    )
    if Counter is not None
    else _NoopCounter()
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Thin middleware wrapper around the rate-limit policy/backends."""

    TRUSTED_PROXIES = set(DEFAULT_TRUSTED_PROXIES)

    def __init__(
        self,
        app,
        limits: Mapping[str, tuple[int, int]] | None = None,
        enabled: bool = True,
        trusted_proxies: list[str] | set[str] | tuple[str, ...] | None = None,
        redis_key_prefix: str = "riskhub:rl",
    ):
        super().__init__(app)
        self.enabled = enabled
        self.redis_key_prefix = redis_key_prefix
        self.trusted_proxies = list(trusted_proxies) if trusted_proxies is not None else list(self.TRUSTED_PROXIES)
        self._client_ip_resolver = ClientIPResolver(self.trusted_proxies)
        self._default_settings = get_settings()
        self._memory_backend = InMemoryRateLimitBackend()
        self._redis_backend = RedisRateLimitBackend()
        configured_settings = getattr(getattr(app, "state", None), "settings", self._default_settings)
        self.limits: dict[str, RateLimitRule] = resolve_rate_limit_rules(
            configured_settings,
            explicit_limits=limits,
        )

    @property
    def state(self) -> dict[str, RateLimitState]:
        return self._memory_backend.state

    def _is_trusted_proxy(self, ip_str: str) -> bool:
        return self._client_ip_resolver.is_trusted_proxy(ip_str)

    def _get_client_ip(self, request: Request) -> str:
        return resolve_request_client_ip(request, self._client_ip_resolver.trusted_proxies)

    def _get_limit_for_path(self, path: str) -> RateLimitRule:
        return get_limit_for_path(self.limits, path)

    def _is_fail_closed_path(self, *, request: Request, path: str) -> bool:
        settings = getattr(request.app.state, "settings", self._default_settings)
        prefixes = settings.redis.rate_limit_fail_closed_prefixes
        for prefix in prefixes:
            if isinstance(prefix, str) and prefix and path.startswith(prefix):
                return True
        return False

    def _should_fail_closed_on_backend_error(self, *, request: Request, path: str) -> bool:
        settings = getattr(request.app.state, "settings", self._default_settings)
        if getattr(settings, "debug", False):
            return False
        if settings.redis.rate_limit_fail_closed_on_backend_error:
            return True
        return self._is_fail_closed_path(request=request, path=path)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if not self.enabled:
            return await call_next(request)
        if request.method == "OPTIONS":
            return await call_next(request)

        now = time.time()
        client_ip = self._get_client_ip(request)
        path = request.url.path
        max_requests, window = self._get_limit_for_path(path)

        redis = getattr(request.app.state, "redis", None)
        if redis is not None:
            try:
                allowed, retry_after = await self._redis_backend.check(
                    redis=redis,
                    redis_key_prefix=self.redis_key_prefix,
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
                    return build_rate_limit_response(retry_after=retry_after)
                return await call_next(request)
            except (RedisError, TimeoutError, OSError, RuntimeError) as exc:
                logger.warning("rate_limit_redis_error", client_ip=client_ip, path=path, error=str(exc))
                RATE_LIMIT_BACKEND_UNAVAILABLE_TOTAL.inc()
                if self._should_fail_closed_on_backend_error(request=request, path=path):
                    return build_rate_limit_backend_unavailable_response()

        allowed, retry_after = self._memory_backend.check(
            client_ip=client_ip,
            path=path,
            max_requests=max_requests,
            window=window,
            now=now,
        )
        if not allowed:
            logger.warning(
                "rate_limit_exceeded",
                client_ip=client_ip,
                path=path,
                limit=max_requests,
                window=window,
            )
            return build_rate_limit_response(retry_after=retry_after)
        return await call_next(request)
