"""Independent transaction races for factor confirmation and recovery authority."""

import asyncio
from collections.abc import AsyncIterator

import pyotp
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import InstallationIdentity, LocalAuthFactor, User
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
)
from tests.backend.pytest.test_local_recovery import recent

pytestmark = [pytest.mark.asyncio, pytest.mark.postgres]


async def test_replacement_confirm_one_winner(
    async_engine,
    db_session,
    native_context,
    client_factory,
    test_user,
    test_user_employee,
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
        codes, _ = await enroll(client, invitation["credential"])
        await login_native(client, "journey@example.com", PASSWORD, codes[0])
        proof = await recent(client, user_id, codes[1], "factor_replace")
        setup = await client.post(
            "/api/v1/auth/local/factor/replace", json={"recent_auth_proof": proof}
        )
        assert setup.status_code == 200, setup.text
        cookies = dict(client.cookies)
        body = {
            "challenge": setup.json()["challenge"],
            "code": pyotp.parse_uri(setup.json()["provisioning_uri"]).now(),
        }
    await db_session.rollback()
    maker = async_sessionmaker(async_engine, expire_on_commit=False)
    names = iter(["replacement-0", "replacement-1"])

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
                asyncio.create_task(
                    client.post("/api/v1/auth/local/factor/confirm", json=body)
                )
                for _ in range(2)
            ]
            try:
                await wait_for_lock_waiters(
                    observer, {"replacement-0", "replacement-1"}
                )
            finally:
                await gate.commit()
            results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=20)
    assert sorted(result.status_code for result in results) == [200, 401]
    factor = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
    assert factor.confirmed_at is not None


async def test_suspension_during_recovery_prevents_completion(
    native_context, client_factory, db_session, test_user, test_user_employee
):
    from app.core.security import get_password_hash

    test_user.hashed_password = get_password_hash(PASSWORD)
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
        await enroll(client, invitation["credential"])
    native_context.local_mfa_policy = "optional"
    target = await db_session.get(User, user_id, populate_existing=True)
    version = target.token_version
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as admin:
        from tests.backend.pytest.test_local_identity import login_password_only

        await login_password_only(admin, test_user.email, PASSWORD)
        proof = await recent(
            admin,
            user_id,
            None,
            "assisted_recovery",
            expected_token_version=version,
            intended_recovery_operation="factor_recovery",
        )
        started = await admin.post(
            f"/api/v1/users/{user_id}/recovery",
            json={
                "recent_auth_proof": proof,
                "expected_token_version": version,
                "operation": "factor_recovery",
                "incident_reference": "INC-race",
                "verification_method": "in-person",
                "reason": "Lost device",
            },
        )
        assert started.status_code == 202, started.text
        _, mail = await latest_mail(
            db_session, native_context, user_id=user_id, kind="recovery"
        )
        async with client_factory(
            settings=native_context, headers={"Origin": "http://test"}
        ) as recipient:
            await csrf(recipient)
            setup = await recipient.post(
                "/api/v1/auth/local/recovery/start",
                json={"grant": mail["credential"], "current_password": PASSWORD},
            )
            assert setup.status_code == 200, setup.text
            suspended = await admin.patch(
                f"/api/v1/users/{user_id}", json={"is_active": False}
            )
            assert suspended.status_code == 200, suspended.text
            result = await recipient.post(
                "/api/v1/auth/local/recovery/confirm",
                json={
                    "challenge": setup.json()["challenge"],
                    "code": pyotp.parse_uri(setup.json()["provisioning_uri"]).now(),
                },
            )
            assert result.status_code == 401, result.text
        await db_session.refresh(target)
        assert (
            target.local_suspended
            and target.local_recovery_pending
            and not target.is_active
        )


@pytest.mark.parametrize("first", ["rotation", "replacement"])
async def test_rotation_racing_replacement_preserves_new_factor(
    async_engine,
    db_session,
    native_context,
    client_factory,
    test_user,
    test_user_employee,
    first,
):
    import base64
    import json
    import secrets
    from pathlib import Path

    from app.main import app
    from app.services._local_auth.common import build_context
    from app.services._local_auth.key_rotation import reencrypt_batch
    from app.services._local_auth.keys import LocalKeyring

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
        codes, _ = await enroll(client, invitation["credential"])
        token = await login_native(client, "journey@example.com", PASSWORD, codes[0])
        proof = await recent(client, user_id, codes[1], "factor_replace")
        setup = await client.post(
            "/api/v1/auth/local/factor/replace", json={"recent_auth_proof": proof}
        )
        assert setup.status_code == 200, setup.text
        cookies = dict(client.cookies)
        seed = pyotp.parse_uri(setup.json()["provisioning_uri"]).secret
        body = {"challenge": setup.json()["challenge"], "code": pyotp.TOTP(seed).now()}
    original = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
    old_generation = original.generation
    old_version = (
        await db_session.get(User, user_id, populate_existing=True)
    ).token_version
    await db_session.rollback()
    key_file = Path(native_context.local_auth_keyring_file)
    data = json.loads(key_file.read_text())
    data["purposes"]["totp"]["keys"]["v2"] = base64.b64encode(
        secrets.token_bytes(32)
    ).decode()
    data["purposes"]["totp"]["active"] = "v2"
    key_file.write_text(json.dumps(data))
    maker = async_sessionmaker(async_engine, expire_on_commit=False)

    async def rotation():
        async with maker() as session:
            await session.execute(
                text("SELECT set_config('application_name', 'rotation', true)")
            )
            ctx = await build_context(
                session,
                settings=native_context,
                redis=app.state.redis,
                source="rotation-race",
            )
            return await reencrypt_batch(
                session, ctx, after_user_id=user_id - 1, limit=1
            )

    async def independent_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            await session.execute(
                text("SELECT set_config('application_name', 'replacement', true)")
            )
            yield session

    async with client_factory(
        settings=native_context,
        headers={"Origin": "http://test"},
        db_override=independent_db,
    ) as client:
        client.cookies.update(cookies)
        client.headers["X-CSRF-Token"] = cookies["riskhub_csrf_token"]

        async def replacement():
            return await client.post("/api/v1/auth/local/factor/confirm", json=body)

        operations = {"rotation": rotation, "replacement": replacement}
        second = "replacement" if first == "rotation" else "rotation"
        async with maker() as gate, maker() as observer:
            await gate.execute(
                select(User.id).where(User.id == user_id).with_for_update()
            )
            tasks = {}
            try:
                tasks[first] = asyncio.create_task(operations[first]())
                await wait_for_lock_waiters(observer, {first})
                tasks[second] = asyncio.create_task(operations[second]())
                await wait_for_lock_waiters(observer, {first, second})
            finally:
                await gate.commit()
            results = dict(
                zip(
                    tasks,
                    await asyncio.wait_for(asyncio.gather(*tasks.values()), timeout=20),
                    strict=True,
                )
            )
        assert results["replacement"].status_code == 200, results["replacement"].text
        client.headers["Authorization"] = "Bearer " + token
        assert (await client.get("/api/v1/auth/me")).status_code == 401
    factor = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
    assert factor.generation != old_generation and factor.key_id == "v2"
    assert (
        LocalKeyring.load(str(key_file)).decrypt(
            "totp",
            factor.key_id,
            factor.encrypted_seed,
            [
                (await db_session.scalar(select(InstallationIdentity))).installation_id,
                str(user_id),
                factor.generation,
            ],
        )
        == seed
    )
    assert pyotp.TOTP(seed).at(factor.last_time_step * 30) == body["code"]
    assert (
        await db_session.get(User, user_id, populate_existing=True)
    ).token_version == old_version + 1
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as fresh:
        await login_native(
            fresh,
            "journey@example.com",
            PASSWORD,
            results["replacement"].json()["recovery_codes"][0],
        )


async def test_interrupted_rotation_resumes_committed_users(
    async_engine,
    db_session,
    native_context,
    client_factory,
    test_user,
    test_user_employee,
):
    import base64
    import json
    import secrets
    from pathlib import Path

    from app.main import app
    from app.services._local_auth.common import build_context
    from app.services._local_auth.key_rotation import reencrypt_batch
    from app.services._local_auth.keys import LocalKeyring

    require_postgres(async_engine)
    users = []
    for i in (1, 2):
        email = f"rotate-{i}@example.com"
        user_id = await create_invitation(
            client_factory,
            native_context,
            db_session,
            test_user,
            test_user_employee.role_id,
            email=email,
        )
        _, invitation = await latest_mail(
            db_session, native_context, user_id=user_id, kind="invitation"
        )
        async with client_factory(
            settings=native_context, headers={"Origin": "http://test"}
        ) as client:
            codes, setup = await enroll(client, invitation["credential"])
            token = await login_native(client, email, PASSWORD, codes[0])
        factor = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
        user = await db_session.get(User, user_id, populate_existing=True)
        users.append(
            (
                user_id,
                factor.generation,
                factor.last_time_step,
                user.token_version,
                setup,
                token,
            )
        )
    installation_id = (
        await db_session.scalar(select(InstallationIdentity))
    ).installation_id
    await db_session.rollback()
    key_file = Path(native_context.local_auth_keyring_file)
    data = json.loads(key_file.read_text())
    data["purposes"]["totp"]["keys"]["v2"] = base64.b64encode(
        secrets.token_bytes(32)
    ).decode()
    data["purposes"]["totp"]["active"] = "v2"
    key_file.write_text(json.dumps(data))
    maker = async_sessionmaker(async_engine, expire_on_commit=False)
    # A blocked second user gives us a deterministic interruption after the first commit.
    async with maker() as gate, maker() as observer:
        await gate.execute(
            select(User.id).where(User.id == users[1][0]).with_for_update()
        )

        async def interrupted_worker():
            async with maker() as session:
                # Session-scoped name survives each per-user commit.
                await session.execute(
                    text(
                        "SELECT set_config('application_name', 'interrupted-rotation', false)"
                    )
                )
                ctx = await build_context(
                    session,
                    settings=native_context,
                    redis=app.state.redis,
                    source="interrupted-rotation",
                )
                await reencrypt_batch(
                    session, ctx, after_user_id=users[0][0] - 1, limit=2
                )

        task = asyncio.create_task(interrupted_worker())
        try:
            await wait_for_lock_waiters(observer, {"interrupted-rotation"})
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            await gate.rollback()
    async with maker() as observer:
        first_factor = await observer.get(LocalAuthFactor, users[0][0])
        second_factor = await observer.get(LocalAuthFactor, users[1][0])
        assert first_factor.key_id == "v2" and second_factor.key_id == "v1"
        committed_ciphertext = first_factor.encrypted_seed
    async with maker() as session:
        ctx = await build_context(
            session,
            settings=native_context,
            redis=app.state.redis,
            source="resumed-rotation",
        )
        result = await reencrypt_batch(
            session, ctx, after_user_id=users[0][0] - 1, limit=2
        )
        assert result["references_changed"] == 1
    for user_id, generation, step, version, setup, token in users:
        factor = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
        assert factor.key_id == "v2" and (factor.generation, factor.last_time_step) == (
            generation,
            step,
        )
        assert (
            LocalKeyring.load(str(key_file)).decrypt(
                "totp",
                factor.key_id,
                factor.encrypted_seed,
                [installation_id, str(user_id), generation],
            )
            == pyotp.parse_uri(setup["provisioning_uri"]).secret
        )
        assert (
            await db_session.get(User, user_id, populate_existing=True)
        ).token_version == version
        if user_id == users[0][0]:
            assert factor.encrypted_seed == committed_ciphertext
        async with client_factory(
            settings=native_context, headers={"Authorization": "Bearer " + token}
        ) as client:
            assert (await client.get("/api/v1/auth/me")).status_code == 200
