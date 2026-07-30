from __future__ import annotations

from types import SimpleNamespace

import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import Settings
from app.core.security import create_access_token
from app.middleware.rate_limit import RateLimitMiddleware


class _FailingRedis:
    async def eval(self, *args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("redis unavailable")


def _build_request(
    *,
    app,
    path: str,
    peer_ip: str = "198.51.100.10",
    headers: list[tuple[bytes, bytes]] | None = None,
) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": headers or [],
        "client": (peer_ip, 12345),
        "server": ("testserver", 80),
        "app": app,
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_dq_family_shares_one_bucket_per_authenticated_principal_and_ip():
    settings = Settings(
        debug=True, secret_key="test-secret-key-32-chars-minimum-value"
    )
    app = SimpleNamespace(state=SimpleNamespace(redis=None, settings=settings))
    middleware = RateLimitMiddleware(
        app,
        enabled=True,
        limits={"/api/v1/ict-register/dq": (1, 60), "default": (100, 60)},
    )

    async def call_next(_request):
        return JSONResponse({"ok": True})

    def bearer(user_id: int) -> list[tuple[bytes, bytes]]:
        token = create_access_token({"sub": str(user_id)}, settings=settings)
        return [(b"authorization", f"Bearer {token}".encode("ascii"))]

    first = await middleware.dispatch(
        _build_request(
            app=app, path="/api/v1/ict-register/dq", headers=bearer(1)
        ),
        call_next,
    )
    same_principal_detail = await middleware.dispatch(
        _build_request(
            app=app,
            path="/api/v1/ict-register/dq/DQ-01/violations",
            headers=bearer(1),
        ),
        call_next,
    )
    other_principal = await middleware.dispatch(
        _build_request(
            app=app,
            path="/api/v1/ict-register/dq/DQ-01/violations",
            headers=bearer(2),
        ),
        call_next,
    )

    assert first.status_code == 200
    assert same_principal_detail.status_code == 429
    assert other_principal.status_code == 200


@pytest.mark.asyncio
async def test_rate_limit_returns_503_on_sensitive_path_when_redis_fails():
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        rate_limit_fail_closed_on_backend_error=True,
        rate_limit_fail_closed_prefixes=["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"],
    )
    app = SimpleNamespace(state=SimpleNamespace(redis=_FailingRedis(), settings=settings))
    middleware = RateLimitMiddleware(app, enabled=True)

    request = _build_request(app=app, path="/api/v1/auth/login")

    async def call_next(_request):
        return JSONResponse({"ok": True})

    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 503
    assert response.headers.get("Retry-After") == "5"


@pytest.mark.asyncio
async def test_rate_limit_falls_back_to_memory_when_fail_closed_rollback_is_disabled():
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        rate_limit_fail_closed_on_backend_error=False,
        rate_limit_fail_closed_prefixes=["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"],
    )
    app = SimpleNamespace(state=SimpleNamespace(redis=_FailingRedis(), settings=settings))
    middleware = RateLimitMiddleware(
        app,
        enabled=True,
        limits={"/api/v1/health": (1, 60), "default": (1, 60)},
    )

    async def call_next(_request):
        return JSONResponse({"ok": True})

    first = await middleware.dispatch(_build_request(app=app, path="/api/v1/health"), call_next)
    second = await middleware.dispatch(_build_request(app=app, path="/api/v1/health"), call_next)

    assert first.status_code == 200
    assert second.status_code == 429


@pytest.mark.asyncio
async def test_rate_limit_returns_503_for_any_path_when_fail_closed_is_enabled():
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        rate_limit_fail_closed_on_backend_error=True,
    )
    app = SimpleNamespace(state=SimpleNamespace(redis=_FailingRedis(), settings=settings))
    middleware = RateLimitMiddleware(app, enabled=True)

    request = _build_request(app=app, path="/api/v1/health")

    async def call_next(_request):
        return JSONResponse({"ok": True})

    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_rate_limit_skips_options_preflight_requests():
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        rate_limit_fail_closed_on_backend_error=True,
    )
    app = SimpleNamespace(state=SimpleNamespace(redis=_FailingRedis(), settings=settings))
    middleware = RateLimitMiddleware(app, enabled=True, limits={"default": (1, 60)})

    async def call_next(_request):
        return JSONResponse({"ok": True})

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "OPTIONS",
        "scheme": "http",
        "path": "/api/v1/health",
        "raw_path": b"/api/v1/health",
        "query_string": b"",
        "headers": [],
        "client": ("198.51.100.10", 12345),
        "server": ("testserver", 80),
        "app": app,
    }
    request = Request(scope)

    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 200
