"""Current-account factor projection is scoped, nonsecret and never authenticates a challenge."""

import pytest

from app.core.datetime_utils import utc_now
from app.core.security import get_password_hash
from app.models import LocalAuthFactor
from tests.backend.pytest.test_local_identity import PASSWORD, login_password_only


@pytest.mark.asyncio
@pytest.mark.parametrize("policy,confirmed", [("optional", False), ("optional", True), ("required", True)])
async def test_account_security_projects_only_current_factor(
    native_context, client_factory, db_session, test_user, test_user_employee, policy, confirmed
):
    native_context.local_mfa_policy = policy
    test_user.local_enrollment_state = "enrolled"
    test_user.local_email_verified_at = utc_now()
    if confirmed:
        db_session.add(LocalAuthFactor(
            user_id=test_user.id, generation="current", key_id="v1", encrypted_seed="never-return-this",
            confirmed_at=utc_now(), last_time_step=-1,
        ))
    # A different account's factor must never determine the current user's form.
    db_session.add(LocalAuthFactor(
        user_id=test_user_employee.id, generation="other", key_id="v1", encrypted_seed="other-seed",
        confirmed_at=utc_now(), last_time_step=-1,
    ))
    await db_session.commit()
    async with client_factory(current_user=test_user, settings=native_context) as client:
        response = await client.get("/api/v1/auth/local/account")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "mfa_enabled": confirmed,
        "factor_required": confirmed or policy == "required",
        "mfa_policy": policy,
    }
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"


@pytest.mark.asyncio
async def test_account_security_requires_real_session_and_rejects_suspended_account(
    native_context, client_factory, db_session, test_user
):
    native_context.local_mfa_policy = "optional"
    test_user.local_enrollment_state = "enrolled"
    test_user.local_email_verified_at = utc_now()
    test_user.hashed_password = get_password_hash(PASSWORD)
    await db_session.commit()
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        denied = await client.get("/api/v1/auth/local/account")
        assert denied.status_code == 401
        await login_password_only(client, test_user.email)
        me = (await client.get("/api/v1/auth/me")).json()
        # The completed issuer must carry the same capabilities used by /me,
        # because the shared frontend keeps the authoritative completed user.
        login = await client.post("/api/v1/auth/login", json={"email": test_user.email, "password": PASSWORD})
        assert login.status_code == 200
        assert login.json()["user"]["me_capabilities"] == me["me_capabilities"]
        assert login.json()["user"]["me_capabilities"]["identity"]["can_manage_own_credentials"] is True
        assert (await client.get("/api/v1/auth/local/account")).json()["factor_required"] is False
        test_user.local_suspended = True
        await db_session.commit()
        assert (await client.get("/api/v1/auth/local/account")).status_code in {401, 403}
