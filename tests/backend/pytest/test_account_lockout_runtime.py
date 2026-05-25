from __future__ import annotations

import pytest
from fastapi import FastAPI

from app.core.config import Settings
from app.main import bootstrap_runtime_services
from app.services.account_lockout_service import AccountLockoutService, InMemoryAccountLockoutBackend


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "debug": True,
        "secret_key": "test-secret-key-32-chars-minimum-value",
        "app_name": "RiskHub",
        "app_version": "1.0.0-test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def _app_with_settings(settings: Settings) -> FastAPI:
    app = FastAPI()
    app.state.settings = settings
    app.state.redis = None
    return app


@pytest.mark.asyncio
async def test_debug_false_requires_redis_lockout_backend(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_start_scheduler_async() -> None:
        raise AssertionError("scheduler must not start when production Redis is missing")

    monkeypatch.setattr("app.main.start_scheduler_async", fake_start_scheduler_async)
    app = _app_with_settings(_settings(debug=False, redis_url=None))

    with pytest.raises(RuntimeError, match="REDIS_URL is required"):
        await bootstrap_runtime_services(app)


@pytest.mark.asyncio
async def test_in_memory_lockout_rejected_for_multi_worker_production_like_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_start_scheduler_async() -> None:
        raise AssertionError("scheduler must not start when runtime is rejected")

    monkeypatch.setattr("app.main.start_scheduler_async", fake_start_scheduler_async)
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    app = _app_with_settings(_settings(debug=True, redis_url=None))

    with pytest.raises(RuntimeError, match="in-memory account lockout.*multi-worker"):
        await bootstrap_runtime_services(app)


@pytest.mark.asyncio
async def test_debug_demo_single_worker_can_use_in_memory_lockout(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_start_scheduler_async() -> None:
        return None

    monkeypatch.delenv("API_WORKERS", raising=False)
    monkeypatch.delenv("UVICORN_WORKERS", raising=False)
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    monkeypatch.setattr("app.main.start_scheduler_async", fake_start_scheduler_async)
    app = _app_with_settings(_settings(debug=True, redis_url=None))

    await bootstrap_runtime_services(app)

    assert app.state.redis is None
    assert isinstance(app.state.account_lockout, AccountLockoutService)
    assert isinstance(app.state.account_lockout.backend, InMemoryAccountLockoutBackend)
    assert app.state.sso_challenge_store is not None
