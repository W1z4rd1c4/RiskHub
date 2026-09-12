"""Actual Redis multi-client admission proof; no SQLite/fakeredis substitute."""

from __future__ import annotations

import asyncio
import os
from uuid import uuid4

import pytest
from redis.asyncio import Redis

from app.core.exceptions import DomainError, ServiceFailure
from app.services._local_auth.limiter import NativeRateLimiter

pytestmark = [pytest.mark.asyncio, pytest.mark.redis_integration]


async def test_native_limits_are_shared_across_clients_and_fail_closed():
    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL required for real Redis proof")
    first, second = Redis.from_url(url), Redis.from_url(url)
    installation = str(uuid4())
    one, two = (
        NativeRateLimiter(first, installation),
        NativeRateLimiter(second, installation),
    )
    try:
        await first.ping()
        results = await asyncio.gather(
            one.count("proof", "target", 900), two.count("proof", "target", 900)
        )
        assert sorted(count for count, _ in results) == [1, 2]
        await one.require("proof", "target", 3, 900)
        with pytest.raises(DomainError) as error:
            await two.require("proof", "target", 3, 900)
        assert error.value.status_code == 429
        unavailable = Redis.from_url(
            "redis://127.0.0.1:1", socket_connect_timeout=0.2, socket_timeout=0.2
        )
        try:
            with pytest.raises(ServiceFailure) as error:
                await NativeRateLimiter(unavailable, installation).require(
                    "proof", "target", 3, 900
                )
            assert error.value.status_code == 503
        finally:
            await unavailable.aclose()
    finally:
        async for key in first.scan_iter(match=f"riskhub:{installation}:local-auth:*"):
            await first.delete(key)
        await first.aclose()
        await second.aclose()


async def test_native_lifespan_connects_real_redis_before_password_login(
    native_context, client_factory, db_session, test_user, monkeypatch
):
    from contextlib import asynccontextmanager
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app import main
    from app.core.datetime_utils import utc_now
    from app.core.security import get_password_hash

    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL required for native lifespan proof")
    native_context.redis_url = url
    native_context.local_mfa_policy = "optional"
    test_user.hashed_password = get_password_hash("Native lifespan passphrase 734!")
    test_user.local_email_verified_at = utc_now()
    test_user.local_enrollment_state = "enrolled"
    await db_session.commit()

    @asynccontextmanager
    async def sessions():
        yield db_session

    # The fixture owns its migrated database and scheduler. Exercise the real
    # lifespan and Redis bootstrap without disposing shared test infrastructure.
    monkeypatch.setattr(main.app.state, "settings", native_context)
    monkeypatch.setattr(main.app.state, "account_lockout", main.app.state.account_lockout)
    monkeypatch.setattr(main.app.state, "sso_challenge_store", main.app.state.sso_challenge_store)
    monkeypatch.setattr(main.app.state, "db_engine", SimpleNamespace(dispose=AsyncMock()))
    monkeypatch.setattr(main.app.state, "db_sessionmaker", sessions)
    monkeypatch.setattr(main, "enforce_schema_head", AsyncMock())
    monkeypatch.setattr(main, "start_scheduler_async", AsyncMock())
    monkeypatch.setattr(main, "stop_scheduler_async", AsyncMock())
    async with main.lifespan(main.app):
        assert isinstance(main.app.state.redis, Redis)
        assert await main.app.state.redis.ping()
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            await client.get("/api/v1/auth/csrf")
            client.headers["X-CSRF-Token"] = client.cookies.get("riskhub_csrf_token")
            login = await client.post(
                "/api/v1/auth/login",
                json={"email": test_user.email, "password": "Native lifespan passphrase 734!"},
            )
            assert login.status_code == 200, login.text
            assert login.json()["access_token"]
