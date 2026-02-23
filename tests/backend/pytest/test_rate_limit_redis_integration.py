from __future__ import annotations

import subprocess
from types import SimpleNamespace

import pytest
from redis.asyncio import Redis
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import Settings
from app.middleware.security import RateLimitMiddleware


def _docker_available() -> bool:
    try:
        result = subprocess.run(
            ["docker", "info"],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception:
        return False
    return result.returncode == 0


def _build_request(*, app, path: str, peer_ip: str = "198.51.100.20") -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": [],
        "client": (peer_ip, 23456),
        "server": ("testserver", 80),
        "app": app,
    }
    return Request(scope)


def _redis_container_url(container) -> str:
    # testcontainers-python API differs by version; prefer helper when present.
    if hasattr(container, "get_connection_url"):
        return container.get_connection_url()
    host = container.get_container_host_ip()
    port = container.get_exposed_port(6379)
    return f"redis://{host}:{port}/0"


@pytest.mark.asyncio
@pytest.mark.redis_integration
async def test_rate_limit_redis_lua_enforces_limit_with_real_redis_container():
    if not _docker_available():
        pytest.skip("Docker unavailable for redis integration test")

    testcontainers_redis = pytest.importorskip("testcontainers.redis")
    RedisContainer = testcontainers_redis.RedisContainer

    with RedisContainer("redis:7-alpine") as container:
        redis_url = _redis_container_url(container)
        redis = Redis.from_url(redis_url, decode_responses=True)
        await redis.ping()

        settings = Settings(
            debug=False,
            secret_key="test-secret-key-32-chars-minimum-value",
        )
        app = SimpleNamespace(state=SimpleNamespace(redis=redis, settings=settings))
        middleware = RateLimitMiddleware(
            app,
            enabled=True,
            limits={"/api/v1/auth/config": (1, 60), "default": (1, 60)},
        )

        async def call_next(_request):
            return JSONResponse({"ok": True})

        first = await middleware.dispatch(_build_request(app=app, path="/api/v1/auth/config"), call_next)
        second = await middleware.dispatch(_build_request(app=app, path="/api/v1/auth/config"), call_next)

        await redis.aclose()

    assert first.status_code == 200
    assert second.status_code == 429
