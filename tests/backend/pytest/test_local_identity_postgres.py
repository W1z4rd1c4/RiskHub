"""Public native-grant/factor races on independent PostgreSQL transactions."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pyotp
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.datetime_utils import utc_now
from app.models import LocalAuthFactor, LocalAuthRecoveryCode, RefreshToken, User
from tests.backend.pytest.test_identity_foundations_postgres import (
    require_postgres,
    wait_for_lock_waiters,
)
from tests.backend.pytest.test_local_identity import (
    PASSWORD,
    create_invitation,
    csrf,
    enroll,
    latest_mail,
    login_native,
    login_password_only,
)

pytestmark = [pytest.mark.asyncio, pytest.mark.postgres]


@pytest.mark.parametrize("operation", ["enrollment", "recovery_code", "totp", "reset", "mfa_challenge"])
async def test_native_one_time_proof_concurrent_consumption(
    async_engine,
    db_session,
    client_factory,
    native_context,
    test_user,
    test_user_employee,
    operation,
    monkeypatch,
):
    require_postgres(async_engine)
    user_id = await create_invitation(
        client_factory,
        native_context,
        db_session,
        test_user,
        test_user_employee.role_id,
    )
    _, invitation = await latest_mail(
        db_session, native_context, user_id=user_id, kind="invitation"
    )
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        if operation == "enrollment":
            path = "/api/v1/auth/local/enrollment/start"
            bodies = [{"grant": invitation["credential"], "password": PASSWORD}] * 2
        else:
            codes, setup = await enroll(client, invitation["credential"])
            if operation == "totp":
                from app.services._local_auth import factors

                captured = utc_now()
                monkeypatch.setattr(factors, "utc_now", lambda: captured)
                expected_step = int(captured.timestamp()) // 30 + 1
                factor = await db_session.get(LocalAuthFactor, user_id)
                original_generation = factor.generation
            if operation in {"recovery_code", "totp", "mfa_challenge"}:
                path = "/api/v1/auth/local/mfa/verify"
                bodies = []
                for attempt in range(2):
                    if operation != "mfa_challenge" or attempt == 0:
                        result = await client.post(
                            "/api/v1/auth/login",
                            json={"email": "journey@example.com", "password": PASSWORD},
                        )
                        assert result.status_code == 202, result.text
                    code = (
                        codes[attempt]
                        if operation == "mfa_challenge"
                        else codes[0]
                        if operation in {"recovery_code", "mfa_challenge"}
                        else pyotp.parse_uri(setup["provisioning_uri"]).at(expected_step * 30)
                    )
                    bodies.append(
                        {
                            "challenge": result.json()["challenge"],
                            "code": code,
                            "method": "recovery_code" if operation in {"recovery_code", "mfa_challenge"} else "totp",
                        }
                    )
            else:
                await login_native(client, "journey@example.com", PASSWORD, codes[0])
                result = await client.post(
                    "/api/v1/auth/local/password/reset/request",
                    json={"email": "journey@example.com"},
                )
                assert result.status_code == 202
                _, mail = await latest_mail(
                    db_session, native_context, user_id=user_id, kind="reset"
                )
                path = "/api/v1/auth/local/password/reset/complete"
                bodies = [
                    {
                        "grant": mail["credential"],
                        "password": "Reset concurrently by exactly one request!",
                    }
                ] * 2
        cookies = dict(client.cookies)
    # Release the fixture's read transaction before independent HTTP transactions.
    await db_session.rollback()
    maker = async_sessionmaker(async_engine, expire_on_commit=False)
    names = iter(["native-proof-0", "native-proof-1"])

    async def independent_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            await session.execute(
                text("SELECT set_config('application_name', :name, true)"),
                {"name": next(names)},
            )
            yield session

    async with maker() as gate, maker() as observer:
        await gate.execute(select(User.id).where(User.id == user_id).with_for_update())
        async with client_factory(
            settings=native_context,
            headers={"Origin": "http://test"},
            db_override=independent_db,
        ) as client:
            client.cookies.update(cookies)
            client.headers["X-CSRF-Token"] = cookies["riskhub_csrf_token"]
            tasks = [
                asyncio.create_task(client.post(path, json=body)) for body in bodies
            ]
            try:
                await wait_for_lock_waiters(
                    observer, {"native-proof-0", "native-proof-1"}
                )
            finally:
                await gate.commit()
            results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=20)
    assert sorted(result.status_code for result in results) == (
        [202, 401] if operation == "enrollment" else [200, 401]
    )
    active = (
        (
            await db_session.execute(
                select(RefreshToken).where(
                    RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(active) == (1 if operation in {"recovery_code", "totp", "mfa_challenge"} else 0)
    if operation == "totp":
        async with maker() as observer:
            persisted = await observer.get(LocalAuthFactor, user_id)
            assert persisted.last_time_step == expected_step
            assert persisted.generation == original_generation
    if operation == "recovery_code":
        used = (
            (
                await db_session.execute(
                    select(LocalAuthRecoveryCode).where(
                        LocalAuthRecoveryCode.user_id == user_id,
                        LocalAuthRecoveryCode.consumed_at.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(used) == 1

    if operation == "mfa_challenge":
        import hashlib

        from app.core.tokens import decode_refresh_token
        from app.models import LocalAuthGrant

        assert bodies[0]["challenge"] == bodies[1]["challenge"]
        assert bodies[0]["code"] != bodies[1]["code"]
        winner = next(index for index, response in enumerate(results) if response.status_code == 200)
        loser = 1 - winner
        assert "access_token" not in results[loser].json()
        assert "riskhub_refresh_token=" not in results[loser].headers.get("set-cookie", "")
        refresh_claims = decode_refresh_token(results[winner].cookies["riskhub_refresh_token"], native_context)
        async with maker() as fresh:
            grant = await fresh.get(LocalAuthGrant, bodies[0]["challenge"].split(".")[0])
            assert grant.consumed_at is not None and grant.failures == 0
            rows = list((await fresh.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id))).all())
            assert len(rows) == 1 and rows[0].revoked_at is None and rows[0].jti == refresh_claims["jti"]
            assert rows[0].factor_generation == grant.factor_generation == refresh_claims["factor_generation"]
            for index in [winner, loser]:
                digest = hashlib.sha256(
                    f"riskhub-recovery-v1:{grant.installation_id}:{user_id}:{grant.factor_generation}:{bodies[index]['code']}".encode()
                ).hexdigest()
                code_row = await fresh.scalar(
                    select(LocalAuthRecoveryCode).where(LocalAuthRecoveryCode.digest == digest)
                )
                assert code_row is not None
                assert (code_row.consumed_at is not None) == (index == winner)


async def test_concurrent_invitation_email_uniqueness_has_one_outbox_side_effect(
    async_engine,
    db_session,
    client_factory,
    native_context,
    test_user,
    test_user_employee,
):
    from app.models import LocalAuthDelivery

    require_postgres(async_engine)
    test_user.local_email_verified_at = utc_now()
    test_user.local_enrollment_state = "enrolled"
    role_id = test_user_employee.role_id
    await db_session.commit()
    maker = async_sessionmaker(async_engine, expire_on_commit=False)
    names = iter(["native-invite-0", "native-invite-1"])

    async def independent_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            await session.execute(
                text("SELECT set_config('application_name', :name, true)"),
                {"name": next(names)},
            )
            yield session

    async with maker() as gate, maker() as observer:
        await gate.execute(
            text(
                "SELECT pg_advisory_xact_lock(hashtext('riskhub.identity.administration'))"
            )
        )
        async with client_factory(
            current_user=test_user,
            settings=native_context,
            db_override=independent_db,
            headers={"Origin": "http://test"},
        ) as client:
            await csrf(client)
            tasks = [
                asyncio.create_task(
                    client.post(
                        "/api/v1/users/invitations",
                        json={
                            "email": "same@example.com",
                            "name": "Same user",
                            "role_id": role_id,
                        },
                    )
                )
                for _ in range(2)
            ]
            try:
                await wait_for_lock_waiters(
                    observer, {"native-invite-0", "native-invite-1"}
                )
            finally:
                await gate.commit()
            results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=20)
    assert sorted(result.status_code for result in results) == [202, 409]
    users = (
        (await db_session.execute(select(User).where(User.email == "same@example.com")))
        .scalars()
        .all()
    )
    assert len(users) == 1
    deliveries = (
        (
            await db_session.execute(
                select(LocalAuthDelivery).where(
                    LocalAuthDelivery.user_id == users[0].id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(deliveries) == 1
    from app.models import OutboxEvent

    async with maker() as observer:
        events = (await observer.execute(
            select(OutboxEvent).where(OutboxEvent.event_type == "local_auth.deliver")
        )).scalars().all()
        assert [event.payload for event in events] == [{"delivery_id": deliveries[0].id}]


@pytest.mark.parametrize("mfa_policy", ["required", "optional"])
async def test_native_reset_racing_refresh_cannot_leave_usable_old_authority(
    async_engine,
    db_session,
    client_factory,
    native_context,
    test_user,
    test_user_employee,
    mfa_policy,
):
    require_postgres(async_engine)
    native_context.local_mfa_policy = mfa_policy
    user_id = await create_invitation(
        client_factory,
        native_context,
        db_session,
        test_user,
        test_user_employee.role_id,
    )
    _, invitation = await latest_mail(
        db_session, native_context, user_id=user_id, kind="invitation"
    )
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        if mfa_policy == "required":
            codes, _ = await enroll(client, invitation["credential"])
            access = await login_native(client, "journey@example.com", PASSWORD, codes[0])
        else:
            await csrf(client)
            enrolled = await client.post(
                "/api/v1/auth/local/enrollment/start",
                json={"grant": invitation["credential"], "password": PASSWORD},
            )
            assert enrolled.status_code == 202, enrolled.text
            assert enrolled.json()["status"] == "completed"
            access = await login_password_only(client, "journey@example.com")
        assert (
            await client.post(
                "/api/v1/auth/local/password/reset/request",
                json={"email": "journey@example.com"},
            )
        ).status_code == 202
        _, mail = await latest_mail(
            db_session, native_context, user_id=user_id, kind="reset"
        )
        cookies = dict(client.cookies)
    await db_session.rollback()
    maker = async_sessionmaker(async_engine, expire_on_commit=False)
    names = iter(["native-reset-race-0", "native-reset-race-1"])

    async def independent_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            await session.execute(
                text("SELECT set_config('application_name', :name, true)"),
                {"name": next(names)},
            )
            yield session

    async with maker() as gate, maker() as observer:
        await gate.execute(select(User.id).where(User.id == user_id).with_for_update())
        async with client_factory(
            settings=native_context,
            headers={"Origin": "http://test"},
            db_override=independent_db,
        ) as client:
            client.cookies.update(cookies)
            client.headers["X-CSRF-Token"] = cookies["riskhub_csrf_token"]
            reset = asyncio.create_task(
                client.post(
                    "/api/v1/auth/local/password/reset/complete",
                    json={
                        "grant": mail["credential"],
                        "password": "New credential after concurrent refresh!",
                    },
                )
            )
            refresh = asyncio.create_task(client.post("/api/v1/auth/refresh"))
            try:
                await wait_for_lock_waiters(
                    observer, {"native-reset-race-0", "native-reset-race-1"}
                )
            finally:
                await gate.commit()
            reset_result, refresh_result = await asyncio.wait_for(
                asyncio.gather(reset, refresh), timeout=20
            )
    assert reset_result.status_code == 200, reset_result.text
    assert refresh_result.status_code in {200, 401}
    tokens = [access]
    if refresh_result.status_code == 200:
        tokens.append(refresh_result.json()["access_token"])
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        for token in tokens:
            result = await client.get(
                "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
            )
            assert result.status_code == 401
    active = (
        await db_session.execute(
            select(RefreshToken.id).where(
                RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
            )
        )
    ).all()
    assert active == []


async def test_native_bcrypt_rehash_cannot_overwrite_committed_password_reset(
    async_engine, db_session, client_factory, native_context, test_user_employee, monkeypatch
):
    from pwdlib.hashers.bcrypt import BcryptHasher

    from app.core.security import get_password_hash, verify_password
    from app.services._local_auth import factors

    require_postgres(async_engine)
    native_context.local_mfa_policy = "optional"
    user = test_user_employee
    user.local_enrollment_state, user.local_email_verified_at = "enrolled", utc_now()
    user.hashed_password = BcryptHasher(rounds=12).hash(PASSWORD)
    uid, email, version = user.id, user.email, user.token_version
    await db_session.commit()
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        requested = await client.post("/api/v1/auth/local/password/reset/request", json={"email": email})
        assert requested.status_code == 202
        _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="reset")
        cookies = dict(client.cookies)
    await db_session.rollback()
    maker = async_sessionmaker(async_engine, expire_on_commit=False)

    async def independent_db():
        async with maker() as session:
            yield session

    reached, release = asyncio.Event(), asyncio.Event()
    upgrades = []
    real_lock = factors.lock_session_user

    def real_upgrade(password):
        encoded = get_password_hash(password)
        upgrades.append(encoded)
        return encoded

    async def pause_after_verified_work(db, *, user_id):
        assert user_id == uid and len(upgrades) == 1
        assert upgrades[0].startswith("$argon2id$") and verify_password(PASSWORD, upgrades[0])
        reached.set()
        await asyncio.wait_for(release.wait(), timeout=20)
        return await real_lock(db, user_id=user_id)

    monkeypatch.setattr(factors, "get_password_hash", real_upgrade)
    monkeypatch.setattr(factors, "lock_session_user", pause_after_verified_work)
    changed_password = "Independent committed reset passphrase 842!"
    async with client_factory(settings=native_context, headers={"Origin": "http://test"},
                              db_override=independent_db) as client:
        client.cookies.update(cookies)
        client.headers["X-CSRF-Token"] = cookies["riskhub_csrf_token"]
        login = asyncio.create_task(client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}))
        try:
            await asyncio.wait_for(reached.wait(), timeout=20)
            reset = await client.post("/api/v1/auth/local/password/reset/complete",
                                      json={"grant": mail["credential"], "password": changed_password})
            assert reset.status_code == 200, reset.text
            async with maker() as observer:
                persisted = await observer.get(User, uid)
                reset_hash = persisted.hashed_password
                assert persisted.token_version == version + 1
                assert verify_password(changed_password, reset_hash) and not verify_password(PASSWORD, reset_hash)
        finally:
            release.set()
        rejected = await asyncio.wait_for(login, timeout=20)
        assert rejected.status_code == 401 and "access_token" not in rejected.json()
    async with maker() as observer:
        persisted = await observer.get(User, uid)
        assert persisted.hashed_password == reset_hash and persisted.token_version == version + 1
        assert not (await observer.execute(select(RefreshToken).where(RefreshToken.user_id == uid))).scalars().all()
    monkeypatch.setattr(factors, "lock_session_user", real_lock)
    async with client_factory(settings=native_context, headers={"Origin": "http://test"},
                              db_override=independent_db) as client:
        await csrf(client)
        old = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
        assert old.status_code == 401
        good = await client.post("/api/v1/auth/login", json={"email": email, "password": changed_password})
        assert good.status_code == 200 and "access_token" in good.json(), good.text
