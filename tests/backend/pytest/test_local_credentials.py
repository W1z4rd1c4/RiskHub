"""#200: public credential boundaries, retryability and independent-device revocation."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.datetime_utils import utc_now
from app.models import LocalAuthDelivery, LocalAuthGrant, RefreshToken, User
from tests.backend.pytest.test_local_identity import (
    PASSWORD,
    csrf,
    latest_mail,
    login_password_only,
)
from tests.backend.pytest.test_local_recovery import recent

pytestmark = pytest.mark.asyncio
NEW_PASSWORD = "A separately recovered passphrase 928!"
NEW_EMAIL = "verified-change@example.com"
BASE = "/api/v1/auth/local"


async def snapshot(db, uid):
    """Read persisted authority/artifacts, excluding rate-limit counters and audit rows."""
    user = await db.get(User, uid, populate_existing=True)
    grants = (
        await db.scalars(
            select(LocalAuthGrant)
            .where(LocalAuthGrant.user_id == uid)
            .order_by(LocalAuthGrant.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    refreshes = (
        await db.scalars(
            select(RefreshToken)
            .where(RefreshToken.user_id == uid)
            .order_by(RefreshToken.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    deliveries = (
        await db.scalars(
            select(LocalAuthDelivery.id).where(LocalAuthDelivery.user_id == uid).order_by(LocalAuthDelivery.id)
        )
    ).all()
    return (
        (
            user.email,
            user.hashed_password,
            user.token_version,
            user.local_suspended,
            user.is_active,
            user.local_recovery_pending,
            user.local_email_verified_at,
        ),
        [(g.id, g.consumed_at, g.revoked_at, g.failures, g.token_version) for g in grants],
        [(r.id, r.revoked_at, r.token_version) for r in refreshes],
        list(deliveries),
    )


async def request_reset(client, db, settings, uid):
    user = await db.get(User, uid, populate_existing=True)
    result = await client.post(BASE + "/password/reset/request", json={"email": user.email})
    assert result.status_code == 202, result.text
    _, mail = await latest_mail(db, settings, user_id=uid, kind="reset")
    return mail["credential"]


async def pending_email(client, db, settings, uid, address=NEW_EMAIL):
    proof = await recent(client, uid, None, "email_change", intended_email=address)
    result = await client.post(BASE + "/email/change", json={"recent_auth_proof": proof, "new_email": address})
    assert result.status_code == 202, result.text
    _, mail = await latest_mail(db, settings, user_id=uid, kind="email")
    return mail["credential"]


async def usable_refresh(client):
    result = await client.post("/api/v1/auth/refresh")
    assert result.status_code == 200, result.text
    client.headers["X-CSRF-Token"] = client.cookies.get("riskhub_csrf_token")
    return client.cookies.get("riskhub_refresh_token")


async def denied_refresh(client, raw):
    client.headers.pop("Authorization", None)
    client.cookies.clear()
    await csrf(client)
    client.cookies.set("riskhub_refresh_token", raw, path="/api/v1/auth")
    result = await client.post("/api/v1/auth/refresh")
    assert result.status_code == 401, result.text
    assert "access_token" not in result.json()


@pytest.mark.parametrize("operation", ["reset", "password", "email"])
async def test_credential_completion_revokes_live_independent_device_and_replay(
    credential_account,
    native_context,
    client_factory,
    db_session,
    operation,
):
    uid = credential_account
    async with (
        client_factory(settings=native_context, headers={"Origin": "http://test"}) as actor,
        client_factory(settings=native_context, headers={"Origin": "http://test"}) as device,
    ):
        await login_password_only(actor, "journey@example.com")
        old_access = await login_password_only(device, "journey@example.com")
        live_refresh = await usable_refresh(device)
        if operation == "reset":
            body = {"grant": await request_reset(actor, db_session, native_context, uid), "password": NEW_PASSWORD}
            path = BASE + "/password/reset/complete"
        elif operation == "password":
            proof = await recent(actor, uid, None, "password_change", intended_password=NEW_PASSWORD)
            body, path = {"recent_auth_proof": proof, "password": NEW_PASSWORD}, BASE + "/password/change"
        else:
            raw = await pending_email(actor, db_session, native_context, uid)
            proof = await recent(actor, uid, None, "email_change", intended_email=NEW_EMAIL)
            body, path = {"grant": raw, "recent_auth_proof": proof}, BASE + "/email/confirm"
        assert (await device.get("/api/v1/auth/me")).status_code == 200
        before = await snapshot(db_session, uid)
        completed = await actor.post(path, json=body)
        assert completed.status_code == 200, completed.text
        assert completed.json() == {"status": "completed", "reauthentication_required": True}
        for field in ("grant", "recent_auth_proof"):
            if field in body:
                consumed = await db_session.get(LocalAuthGrant, body[field].split(".")[0], populate_existing=True)
                assert consumed.consumed_at is not None
        assert actor.cookies.get("riskhub_refresh_token") is None
        assert (
            await device.get("/api/v1/auth/me", headers={"Authorization": "Bearer " + old_access})
        ).status_code == 401
        await denied_refresh(device, live_refresh)
        committed = await snapshot(db_session, uid)
        assert committed[0][2] == before[0][2] + 1
        # Simulate a discarded success response: resend the exact credential body.
        await csrf(actor)
        replay = await actor.post(path, json=body)
        assert replay.status_code == 401, replay.text
        assert await snapshot(db_session, uid) == committed
        actor.headers.pop("Authorization", None)
        await login_password_only(
            actor,
            NEW_EMAIL if operation == "email" else "journey@example.com",
            PASSWORD if operation == "email" else NEW_PASSWORD,
        )


@pytest.mark.parametrize(
    "case",
    [
        "bearer_only",
        "missing_recent",
        "wrong_operation",
        "wrong_address",
        "wrong_browser",
        "wrong_actor",
        "wrong_target",
        "expired",
        "consumed",
        "superseded",
        "version_stale",
        "old_address",
        "suspended",
        "inactive",
        "used_recent",
        "expired_recent",
    ],
)
async def test_email_confirmation_denial_preserves_retryable_state(
    credential_account,
    native_context,
    client_factory,
    db_session,
    test_user,
    case,
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        raw = await pending_email(client, db_session, native_context, uid)
        proof = await recent(client, uid, None, "email_change", intended_email=NEW_EMAIL)
        valid_proof, valid_raw, original_cookies = proof, raw, dict(client.cookies)
        original_auth = client.headers["Authorization"]
        pending = await db_session.get(LocalAuthGrant, raw.split(".")[0])
        user = await db_session.get(User, uid)
        restore = None
        if case == "wrong_operation":
            proof = await recent(client, uid, None, "password_change", intended_password=NEW_PASSWORD)
        elif case == "wrong_address":
            proof = await recent(client, uid, None, "email_change", intended_email="other-address@example.com")
        elif case == "wrong_browser":
            client.cookies.clear()
            client.cookies.update({**original_cookies, "riskhub_local_challenge": "A" * 43})
        elif case == "wrong_actor":
            # A different real actor's bearer cannot combine another user's email and recent grants.
            from app.core.security import get_password_hash

            test_user.hashed_password = get_password_hash(PASSWORD)
            await db_session.commit()
            await login_password_only(client, test_user.email)
        elif case == "wrong_target":
            row = await db_session.get(LocalAuthGrant, proof.split(".")[0])
            original = dict(row.context)
            row.context = {**original, "target": uid + 10000}
            restore = (row, "context", original)
        elif case == "expired_recent":
            row = await db_session.get(LocalAuthGrant, proof.split(".")[0])
            restore = (row, "expires_at", row.expires_at)
            row.expires_at = utc_now() - timedelta(seconds=1)
        elif case == "used_recent":
            issued = await client.post(
                BASE + "/email/change", json={"recent_auth_proof": proof, "new_email": NEW_EMAIL}
            )
            assert issued.status_code == 202, issued.text
            _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="email")
            raw = valid_raw = mail["credential"]
            valid_proof = await recent(client, uid, None, "email_change", intended_email=NEW_EMAIL)
        elif case in {"expired", "consumed", "version_stale", "old_address"}:
            field, value = {
                "expired": ("expires_at", utc_now() - timedelta(seconds=1)),
                "consumed": ("consumed_at", utc_now()),
                "version_stale": ("token_version", pending.token_version - 1),
                "old_address": ("context", {**pending.context, "old_email": "obsolete@example.com"}),
            }[case]
            restore = (pending, field, getattr(pending, field))
            setattr(pending, field, value)
        elif case == "superseded":
            valid_raw = await pending_email(client, db_session, native_context, uid)
        elif case in {"suspended", "inactive"}:
            field = "local_suspended" if case == "suspended" else "is_active"
            restore = (user, field, getattr(user, field))
            setattr(user, field, case == "suspended")
        await db_session.commit()
        body = {"grant": raw, "recent_auth_proof": "invalid" if case == "bearer_only" else proof}
        if case == "missing_recent":
            body.pop("recent_auth_proof")
        before = await snapshot(db_session, uid)
        result = await client.post(BASE + "/email/confirm", json=body)
        assert result.status_code in ({422} if case == "missing_recent" else {401, 403}), result.text
        assert await snapshot(db_session, uid) == before
        # Restore only the fixture's artificial adverse state, then use the same unconsumed valid proof.
        if restore:
            row, field, value = restore
            await db_session.refresh(row)
            setattr(row, field, value)
            await db_session.commit()
        client.headers["Authorization"] = original_auth
        client.cookies.clear()
        client.cookies.update(original_cookies)
        client.headers["X-CSRF-Token"] = original_cookies["riskhub_csrf_token"]
        control = await client.post(
            BASE + "/email/confirm", json={"grant": valid_raw, "recent_auth_proof": valid_proof}
        )
        assert control.status_code == 200, control.text


async def test_email_recent_auth_cannot_target_another_user(
    credential_account, native_context, client_factory, db_session
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        before = await snapshot(db_session, uid)
        response = await client.post(
            BASE + "/recent-auth",
            json={
                "password": PASSWORD,
                "operation": "email_change",
                "target_user_id": uid + 10000,
                "intended_email": NEW_EMAIL,
            },
        )
        assert response.status_code == 403, response.text
        assert await snapshot(db_session, uid) == before
        assert await recent(client, uid, None, "email_change", intended_email=NEW_EMAIL)


@pytest.mark.parametrize("case", ["bearer_only", "missing_recent", "wrong_operation", "wrong_address", "wrong_browser"])
async def test_email_request_denial_keeps_recent_proof_retryable(
    credential_account,
    native_context,
    client_factory,
    db_session,
    case,
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        proof = await recent(client, uid, None, "email_change", intended_email=NEW_EMAIL)
        body = {"new_email": NEW_EMAIL, "recent_auth_proof": proof}
        cookies = dict(client.cookies)
        if case == "bearer_only":
            body["recent_auth_proof"] = "invalid"
        elif case == "missing_recent":
            body.pop("recent_auth_proof")
        elif case == "wrong_operation":
            body["recent_auth_proof"] = await recent(
                client, uid, None, "password_change", intended_password=NEW_PASSWORD
            )
        elif case == "wrong_address":
            body["new_email"] = "unapproved@example.com"
        else:
            client.cookies.clear()
            client.cookies.update({**cookies, "riskhub_local_challenge": "A" * 43})
        before = await snapshot(db_session, uid)
        result = await client.post(BASE + "/email/change", json=body)
        assert result.status_code == (422 if case == "missing_recent" else 401), result.text
        assert await snapshot(db_session, uid) == before
        client.cookies.clear()
        client.cookies.update(cookies)
        result = await client.post(BASE + "/email/change", json={"new_email": NEW_EMAIL, "recent_auth_proof": proof})
        assert result.status_code == 202, result.text


async def test_identical_password_consumes_proof_without_churning_authority(
    credential_account,
    native_context,
    client_factory,
    db_session,
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        proof = await recent(client, uid, None, "password_change", intended_password=PASSWORD)
        before = await snapshot(db_session, uid)
        cookie = client.cookies.get("riskhub_refresh_token")
        result = await client.post(BASE + "/password/change", json={"password": PASSWORD, "recent_auth_proof": proof})
        assert result.status_code == 200, result.text
        assert result.json() == {"status": "completed", "reauthentication_required": False}
        after = await snapshot(db_session, uid)
        assert after[0] == before[0] and after[2:] == before[2:]
        assert client.cookies.get("riskhub_refresh_token") == cookie
        assert (await client.get("/api/v1/auth/me")).status_code == 200
        row = await db_session.get(LocalAuthGrant, proof.split(".")[0], populate_existing=True)
        assert row.consumed_at is not None and row.revoked_at is None


@pytest.mark.parametrize("dependency", ["key", "mail"])
async def test_reset_missing_security_configuration_is_generic_and_atomic(
    credential_account,
    native_context,
    client_factory,
    db_session,
    dependency,
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        raw = await request_reset(client, db_session, native_context, uid)
        field = "local_auth_keyring_file" if dependency == "key" else "local_smtp_host"
        original = getattr(native_context, field)
        setattr(native_context, field, None)
        before = await snapshot(db_session, uid)
        replies = []
        for email in ["journey@example.com", "absent@example.com"]:
            result = await client.post(BASE + "/password/reset/request", json={"email": email})
            assert result.status_code == 503, result.text
            replies.append(result.json())
        assert replies[0] == replies[1]
        result = await client.post(BASE + "/password/reset/complete", json={"grant": raw, "password": NEW_PASSWORD})
        assert result.status_code == 503, result.text
        assert await snapshot(db_session, uid) == before
        setattr(native_context, field, original)
        result = await client.post(BASE + "/password/reset/complete", json={"grant": raw, "password": NEW_PASSWORD})
        assert result.status_code == 200, result.text


@pytest.mark.parametrize(
    "case", ["expired", "consumed", "wrong_purpose", "superseded", "wrong_recipient", "version_stale", "suspended"]
)
async def test_reset_artifact_denial_is_nonmutating_with_valid_control(
    credential_account,
    native_context,
    client_factory,
    db_session,
    case,
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        raw = await request_reset(client, db_session, native_context, uid)
        pending = await db_session.get(LocalAuthGrant, raw.split(".")[0])
        restore = None
        if case == "wrong_purpose":
            raw = await pending_email(client, db_session, native_context, uid)
        elif case == "superseded":
            await request_reset(client, db_session, native_context, uid)
        elif case == "suspended":
            user = await db_session.get(User, uid)
            restore = (user, "local_suspended", user.local_suspended)
            user.local_suspended = True
        else:
            field, value = {
                "expired": ("expires_at", utc_now() - timedelta(seconds=1)),
                "consumed": ("consumed_at", utc_now()),
                "wrong_recipient": ("context", {"email": "someone-else@example.com"}),
                "version_stale": ("token_version", pending.token_version - 1),
            }[case]
            setattr(pending, field, value)
        await db_session.commit()
        before = await snapshot(db_session, uid)
        denied = await client.post(BASE + "/password/reset/complete", json={"grant": raw, "password": NEW_PASSWORD})
        assert denied.status_code == 401, denied.text
        assert await snapshot(db_session, uid) == before
        if restore:
            row, field, value = restore
            await db_session.refresh(row)
            setattr(row, field, value)
            await db_session.commit()
        fresh = await request_reset(client, db_session, native_context, uid)
        result = await client.post(BASE + "/password/reset/complete", json={"grant": fresh, "password": NEW_PASSWORD})
        assert result.status_code == 200, result.text


@pytest.mark.parametrize("state", ["enrolled", "inactive", "suspended", "unverified", "invited", "directory", "absent"])
async def test_reset_request_enumeration_has_identical_response_and_no_authority_change(
    credential_account,
    native_context,
    client_factory,
    db_session,
    state,
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        user = await db_session.get(User, uid)
        if state == "inactive":
            user.is_active = False
        elif state == "suspended":
            user.local_suspended = True
        elif state == "unverified":
            user.local_email_verified_at = None
        elif state == "invited":
            user.local_enrollment_state, user.is_active = "invited", False
        elif state == "directory":
            user.external_id = "directory-owned-test-principal"
        await db_session.commit()
        before = await snapshot(db_session, uid)
        response = await client.post(
            BASE + "/password/reset/request",
            json={"email": "absent@example.com" if state == "absent" else "JOURNEY@example.com"},
        )
        assert response.status_code == 202 and response.json() == {"status": "accepted"}, response.text
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["referrer-policy"] == "no-referrer"
        after = await snapshot(db_session, uid)
        assert after[0] == before[0] and after[2] == before[2]
        if state == "enrolled":
            assert len(after[1]) == len(before[1]) + 1 and len(after[3]) == len(before[3]) + 1
        else:
            assert after == before


@pytest.mark.parametrize("operation", ["reset", "email"])
async def test_credential_link_scanner_get_does_not_consume_proof(
    credential_account,
    native_context,
    client_factory,
    db_session,
    operation,
):
    uid = credential_account
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        if operation == "reset":
            raw = await request_reset(client, db_session, native_context, uid)
            path, body = BASE + "/password/reset/complete", {"grant": raw, "password": NEW_PASSWORD}
        else:
            raw = await pending_email(client, db_session, native_context, uid)
            proof = await recent(client, uid, None, "email_change", intended_email=NEW_EMAIL)
            path, body = BASE + "/email/confirm", {"grant": raw, "recent_auth_proof": proof}
        before = await snapshot(db_session, uid)
        response = await client.get(path, params=body)
        assert response.status_code == 405, response.text
        assert await snapshot(db_session, uid) == before
        result = await client.post(path, json=body)
        assert result.status_code == 200, result.text


async def test_reset_invalidates_pending_recent_email_and_mfa_without_replacing_factor(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
):
    from app.models import LocalAuthFactor, LocalAuthRecoveryCode
    from tests.backend.pytest.test_local_identity import create_invitation, enroll, login_native

    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, invitation = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        codes, _ = await enroll(client, invitation["credential"])
        await login_native(client, "journey@example.com", PASSWORD, codes[0])
        request_proof = await recent(client, uid, codes[1], "email_change", intended_email=NEW_EMAIL)
        pending = await client.post(
            BASE + "/email/change", json={"new_email": NEW_EMAIL, "recent_auth_proof": request_proof}
        )
        assert pending.status_code == 202, pending.text
        _, email = await latest_mail(db_session, native_context, user_id=uid, kind="email")
        proof = await recent(client, uid, codes[2], "password_change", intended_password=NEW_PASSWORD)
        login = await client.post("/api/v1/auth/login", json={"email": "journey@example.com", "password": PASSWORD})
        assert login.status_code == 202, login.text
        challenge = login.json()["challenge"]
        factor = await db_session.get(LocalAuthFactor, uid)
        original_factor = (factor.generation, factor.encrypted_seed, factor.last_time_step, factor.confirmed_at)
        code_rows = list(
            (await db_session.scalars(select(LocalAuthRecoveryCode).where(LocalAuthRecoveryCode.user_id == uid))).all()
        )
        original_codes = {row.digest: row.consumed_at for row in code_rows}
        reset = await request_reset(client, db_session, native_context, uid)
        result = await client.post(BASE + "/password/reset/complete", json={"grant": reset, "password": NEW_PASSWORD})
        assert result.status_code == 200, result.text
        await db_session.refresh(factor)
        assert (factor.generation, factor.encrypted_seed, factor.last_time_step, factor.confirmed_at) == original_factor
        for row in code_rows:
            await db_session.refresh(row)
            assert row.consumed_at == original_codes[row.digest]
        for raw in [proof, email["credential"], challenge]:
            grant = await db_session.get(LocalAuthGrant, raw.split(".")[0], populate_existing=True)
            assert grant.revoked_at is not None and grant.consumed_at is None
        client.headers.pop("Authorization", None)
        await csrf(client)
        denied = await client.post(
            BASE + "/mfa/verify", json={"challenge": challenge, "code": codes[3], "method": "recovery_code"}
        )
        assert denied.status_code == 401, denied.text
        # The same unused code still completes ordinary password+factor login.
        await login_native(client, "journey@example.com", NEW_PASSWORD, codes[3])
        denied = await client.post(
            BASE + "/password/change", json={"password": NEW_PASSWORD, "recent_auth_proof": proof}
        )
        assert denied.status_code == 401, denied.text
        fresh = await client.post(
            BASE + "/recent-auth",
            json={
                "password": NEW_PASSWORD,
                "factor": codes[4],
                "method": "recovery_code",
                "target_user_id": uid,
                "operation": "email_change",
                "intended_email": NEW_EMAIL,
            },
        )
        assert fresh.status_code == 200, fresh.text
        denied = await client.post(
            BASE + "/email/confirm", json={"grant": email["credential"], "recent_auth_proof": fresh.json()["proof"]}
        )
        assert denied.status_code == 401, denied.text
        fresh_row = await db_session.get(LocalAuthGrant, fresh.json()["proof"].split(".")[0], populate_existing=True)
        assert fresh_row.consumed_at is None and fresh_row.revoked_at is None
