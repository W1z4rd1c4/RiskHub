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


async def test_reset_http_redis_outage_is_generic_and_does_not_consume_grant(
    credential_account, native_context, client_factory, db_session, monkeypatch,
):
    from app.main import app
    from app.models import InstallationIdentity
    from tests.backend.pytest.test_local_credentials import BASE, NEW_PASSWORD, request_reset, snapshot
    from tests.backend.pytest.test_local_identity import login_password_only

    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL required for reset Redis outage/control evidence")
    redis = Redis.from_url(url)
    unavailable = Redis.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=0.1, socket_timeout=0.1)
    installation = (await db_session.get(InstallationIdentity, 1)).installation_id
    uid = credential_account
    try:
        assert await redis.ping()
        monkeypatch.setattr(app.state, "redis", redis)
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            await login_password_only(client, "journey@example.com")
            raw = await request_reset(client, db_session, native_context, uid)
            before = await snapshot(db_session, uid)
            monkeypatch.setattr(app.state, "redis", unavailable)
            bodies = []
            for email in ["journey@example.com", "absent@example.com"]:
                result = await client.post(BASE + "/password/reset/request", json={"email": email})
                assert result.status_code == 503, result.text
                bodies.append(result.json())
            assert bodies[0] == bodies[1]
            result = await client.post(BASE + "/password/reset/complete", json={"grant": raw, "password": NEW_PASSWORD})
            assert result.status_code == 503, result.text
            assert await snapshot(db_session, uid) == before
            monkeypatch.setattr(app.state, "redis", redis)
            result = await client.post(BASE + "/password/reset/complete", json={"grant": raw, "password": NEW_PASSWORD})
            assert result.status_code == 200, result.text
    finally:
        async for key in redis.scan_iter(match=f"riskhub:{installation}:local-auth:*"):
            await redis.delete(key)
        await unavailable.aclose()
        await redis.aclose()


@pytest.mark.parametrize("scope", ["target", "source", "artifact", "redeem_source"])
async def test_reset_http_limits_use_real_shared_redis_without_credential_mutation(
    credential_account,
    native_context,
    client_factory,
    db_session,
    monkeypatch,
    scope,
):
    from app.main import app
    from app.models import InstallationIdentity, LocalAuthGrant
    from tests.backend.pytest.test_local_credentials import BASE, NEW_PASSWORD, request_reset, snapshot
    from tests.backend.pytest.test_local_identity import csrf, login_password_only

    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL required for reset HTTP threshold proof")
    clients = [Redis.from_url(url), Redis.from_url(url)]
    uid = credential_account
    installation = (await db_session.get(InstallationIdentity, 1)).installation_id
    try:
        for redis in clients:
            assert await redis.ping()
        monkeypatch.setattr(app.state, "redis", clients[0])
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            await login_password_only(client, "journey@example.com")
            baseline = await snapshot(db_session, uid)
            raw = None
            if scope in {"artifact", "redeem_source"}:
                raw = await request_reset(client, db_session, native_context, uid)
                baseline = await snapshot(db_session, uid)
            count = {"target": 4, "source": 31, "artifact": 5, "redeem_source": 11}[scope]
            for index in range(count):
                monkeypatch.setattr(app.state, "redis", clients[index % 2])
                await csrf(client)
                if scope in {"target", "source"}:
                    email = (
                        ("JOURNEY@example.com" if index % 2 else "journey@EXAMPLE.COM")
                        if scope == "target"
                        else f"absent-reset-{index}@example.com"
                    )
                    response = await client.post(BASE + "/password/reset/request", json={"email": email})
                    expected = 429 if scope == "source" and index == 30 else 202
                else:
                    selector, secret = raw.split(".")
                    wrong = selector + "." + ("A" if secret[0] != "A" else "B") + secret[1:]
                    response = await client.post(
                        BASE + "/password/reset/complete",
                        json={
                            "grant": wrong if scope == "artifact" else "0" * 32 + "." + "A" * 43,
                            "password": NEW_PASSWORD,
                        },
                    )
                    expected = 429 if scope == "redeem_source" and index == 10 else 401
                    grant = await db_session.get(LocalAuthGrant, selector, populate_existing=True)
                    assert grant.consumed_at is None
                    assert (grant.revoked_at is not None) is (scope == "artifact" and index == 4)
                assert response.status_code == expected, response.text
                if expected == 429:
                    assert int(response.headers["Retry-After"]) > 0
                if scope == "target":
                    assert response.json() == {"status": "accepted"}
            after = await snapshot(db_session, uid)
            assert after[0] == baseline[0] and after[2] == baseline[2]
            if scope == "target":
                assert len(after[1]) == len(baseline[1]) + 3
                assert len(after[3]) == len(baseline[3]) + 3
            else:
                assert after[3] == baseline[3]
            if scope == "artifact":
                denied = await client.post(
                    BASE + "/password/reset/complete", json={"grant": raw, "password": NEW_PASSWORD}
                )
                assert denied.status_code == 401, denied.text
            namespace = {
                "target": "reset-target",
                "source": "reset-source",
                "artifact": "grant-secret-fail",
                "redeem_source": "redeem-source",
            }[scope]
            keys = [key async for key in clients[0].scan_iter(match=f"riskhub:{installation}:local-auth:{namespace}:*")]
            assert len(keys) == 1
            seconds = 3600 if scope in {"target", "source"} else 900
            assert seconds - 60 <= await clients[1].ttl(keys[0]) <= seconds
            assert int(await clients[1].get(keys[0])) == count
    finally:
        async for key in clients[0].scan_iter(match=f"riskhub:{installation}:local-auth:*"):
            await clients[0].delete(key)
        for redis in clients:
            await redis.aclose()


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


async def test_invitation_public_target_limit_is_shared_across_real_redis_clients(
    native_context, client_factory, db_session, test_user, test_user_employee, monkeypatch
):
    from sqlalchemy import select

    from app import main
    from app.models import InstallationIdentity, LocalAuthDelivery
    from tests.backend.pytest.test_local_identity import create_invitation, csrf

    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL required for invitation public threshold proof")
    clients = [Redis.from_url(url), Redis.from_url(url)]
    binding = await db_session.get(InstallationIdentity, 1)
    installation_id = binding.installation_id
    try:
        for redis in clients:
            assert await redis.ping()
        monkeypatch.setattr(main.app.state, "redis", clients[0])
        uid = await create_invitation(client_factory, native_context, db_session, test_user,
                                      test_user_employee.role_id, email="shared-limit@example.com")
        for index in range(3):
            await db_session.refresh(test_user)
            async with client_factory(current_user=test_user, settings=native_context,
                                      headers={"Origin": "http://test"}) as client:
                monkeypatch.setattr(main.app.state, "redis", clients[(index + 1) % 2])
                await csrf(client)
                response = await client.post(f"/api/v1/users/{uid}/invitations/resend",
                                             json={"reason": "Shared Redis threshold evidence"})
                assert response.status_code == (202 if index < 2 else 429), response.text
                if index == 2:
                    assert int(response.headers["Retry-After"]) > 0
        deliveries = (await db_session.execute(
            select(LocalAuthDelivery).where(LocalAuthDelivery.user_id == uid)
        )).scalars().all()
        assert len(deliveries) == 3
    finally:
        async for key in clients[0].scan_iter(match=f"riskhub:{installation_id}:local-auth:*"):
            await clients[0].delete(key)
        for redis in clients:
            await redis.aclose()


@pytest.mark.parametrize("scope", ["actor", "redeem_source", "artifact"])
async def test_invitation_public_limits_use_shared_redis_without_authority_side_effects(
    native_context, client_factory, db_session, test_user, test_user_employee, monkeypatch, scope
):
    from sqlalchemy import select

    from app import main
    from app.core.datetime_utils import utc_now
    from app.models import InstallationIdentity, LocalAuthDelivery, LocalAuthGrant, RefreshToken, User
    from tests.backend.pytest.test_local_identity import PASSWORD, create_invitation, csrf, latest_mail

    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL required for exact invitation admission limits")
    clients = [Redis.from_url(url), Redis.from_url(url)]
    installation_id = (await db_session.get(InstallationIdentity, 1)).installation_id
    uid = None
    try:
        for redis in clients:
            assert await redis.ping()
        monkeypatch.setattr(main.app.state, "redis", clients[0])
        if scope == "actor":
            test_user.local_enrollment_state, test_user.local_email_verified_at = "enrolled", utc_now()
            await db_session.commit()
            role_id = test_user_employee.role_id
            for index in range(31):
                await db_session.refresh(test_user)
                async with client_factory(current_user=test_user, settings=native_context,
                                          headers={"Origin": "http://test"}) as client:
                    monkeypatch.setattr(main.app.state, "redis", clients[index % 2])
                    await csrf(client)
                    result = await client.post("/api/v1/users/invitations", json={
                        "email": f"actor-limit-{index}@example.com", "name": "Rate fixture", "role_id": role_id,
                    })
                    assert result.status_code == (202 if index < 30 else 429), result.text
            users = (await db_session.execute(
                select(User).where(User.email.like("actor-limit-%@example.com"))
            )).scalars().all()
            assert len(users) == 30
            deliveries = (await db_session.execute(select(LocalAuthDelivery).where(
                LocalAuthDelivery.user_id.in_([user.id for user in users])
            ))).scalars().all()
            assert len(deliveries) == 30
        else:
            uid = await create_invitation(client_factory, native_context, db_session, test_user,
                                          test_user_employee.role_id, email="redemption-limit@example.com")
            _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
            raw = mail["credential"]
            selector, secret = raw.split(".")
            wrong = selector + "." + ("A" if secret[0] != "A" else "B") + secret[1:]
            count = 11 if scope == "redeem_source" else 5
            for index in range(count):
                async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
                    monkeypatch.setattr(main.app.state, "redis", clients[index % 2])
                    await csrf(client)
                    result = await client.post("/api/v1/auth/local/enrollment/start", json={
                        "grant": "0" * 32 + "." + "A" * 43 if scope == "redeem_source" else wrong,
                        "password": PASSWORD,
                    })
                    assert result.status_code == (429 if scope == "redeem_source" and index == 10 else 401), result.text
                    if scope == "artifact":
                        observed = await db_session.get(LocalAuthGrant, selector, populate_existing=True)
                        assert observed.consumed_at is None
                        assert (observed.revoked_at is not None) is (index == 4)
            grant = await db_session.get(LocalAuthGrant, selector, populate_existing=True)
            assert grant.consumed_at is None
            assert (grant.revoked_at is not None) is (scope == "artifact")
            user = await db_session.get(User, uid, populate_existing=True)
            assert user.hashed_password is None and user.local_enrollment_state == "invited"
            assert not (await db_session.execute(
                select(RefreshToken).where(RefreshToken.user_id == uid)
            )).scalars().all()
            if scope == "artifact":
                async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
                    monkeypatch.setattr(main.app.state, "redis", clients[0])
                    await csrf(client)
                    denied = await client.post("/api/v1/auth/local/enrollment/start",
                                               json={"grant": raw, "password": PASSWORD})
                    assert denied.status_code == 401, denied.text
    finally:
        async for key in clients[0].scan_iter(match=f"riskhub:{installation_id}:local-auth:*"):
            await clients[0].delete(key)
        for redis in clients:
            await redis.aclose()
