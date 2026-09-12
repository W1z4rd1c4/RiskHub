"""Independent transaction races for factor confirmation and recovery authority."""

import asyncio
from collections.abc import AsyncIterator

import pyotp
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import LocalAuthFactor, User
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
