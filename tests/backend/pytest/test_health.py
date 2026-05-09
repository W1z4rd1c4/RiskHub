import pytest
from httpx import ASGITransport, AsyncClient
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError

import app.api.v1.endpoints.health as health_endpoint
from app.main import app


@pytest.mark.asyncio
async def test_livez_returns_alive() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/livez")

    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


@pytest.mark.asyncio
async def test_health_check_returns_diagnostic_shape(client_factory) -> None:
    async with client_factory() as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "ready": True,
        "database": "connected",
        "redis": "disabled",
        "scheduler_role": "disabled",
        "scheduler_status": "disabled",
    }


@pytest.mark.asyncio
async def test_readyz_returns_service_unavailable_for_database_errors(client_factory) -> None:
    class _BrokenDbSession:
        async def execute(self, *_args, **_kwargs):
            raise SQLAlchemyError("db offline")

    async def override_get_db():
        yield _BrokenDbSession()

    async with client_factory(db_override=override_get_db) as client:
        response = await client.get("/api/v1/readyz")

    assert response.status_code == 503
    assert response.json() == {
        "ready": False,
        "database": "disconnected",
        "redis": "disabled",
        "scheduler_role": "disabled",
        "scheduler_status": "disabled",
    }


@pytest.mark.asyncio
async def test_readyz_stays_ready_when_redis_is_disconnected(
    client_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _BrokenRedis:
        async def ping(self):
            raise RedisError("redis offline")

    monkeypatch.setattr(app.state, "redis", _BrokenRedis(), raising=False)
    async with client_factory() as client:
        readiness = await client.get("/api/v1/readyz")
        health = await client.get("/api/v1/health")

    assert readiness.status_code == 200
    assert readiness.json() == {
        "ready": True,
        "database": "connected",
        "redis": "disconnected",
        "scheduler_role": "disabled",
        "scheduler_status": "disabled",
    }
    assert health.status_code == 200
    assert health.json()["status"] == "degraded"


@pytest.mark.asyncio
async def test_health_reports_scheduler_follower_ready(
    client_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        health_endpoint,
        "get_scheduler_runtime_state",
        lambda: {
            "process_role": "scheduler",
            "instance_id": "scheduler-follower",
            "process_started_at": "2026-04-01T00:00:00+00:00",
            "scheduler_enabled": True,
            "scheduler_running": False,
            "lock_provider": "postgres_advisory_lock",
            "lock_acquired": False,
            "scheduler_role": "follower",
            "scheduler_status": "follower_ready",
        },
    )
    async with client_factory() as client:
        readiness = await client.get("/api/v1/readyz")
        health = await client.get("/api/v1/health")

    assert readiness.status_code == 200
    assert readiness.json()["scheduler_role"] == "follower"
    assert readiness.json()["scheduler_status"] == "follower_ready"
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"
    assert health.json()["ready"] is True


@pytest.mark.asyncio
async def test_readyz_does_not_swallow_unexpected_errors(client_factory) -> None:
    class _UnexpectedBrokenDbSession:
        async def execute(self, *_args, **_kwargs):
            raise ValueError("unexpected db failure")

    async def override_get_db():
        yield _UnexpectedBrokenDbSession()

    async with client_factory(db_override=override_get_db, raise_app_exceptions=False) as client:
        response = await client.get("/api/v1/readyz")

    assert response.status_code == 500
