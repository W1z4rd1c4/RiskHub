"""Invitation lifecycle and verified resume evidence under both supported policies."""

from datetime import timedelta

import pytest
from pwdlib.hashers.bcrypt import BcryptHasher
from sqlalchemy import select

from app.core.datetime_utils import utc_now
from app.core.security import password_hash_needs_update, verify_password
from app.models import LocalAuthGrant, RefreshToken, User
from tests.backend.pytest.test_local_identity import PASSWORD, create_invitation, csrf, latest_mail


async def account_state(db, uid):
    user = await db.get(User, uid, populate_existing=True)
    return (
        user.hashed_password,
        user.token_version,
        user.local_enrollment_state,
        user.local_email_verified_at,
        user.is_active,
        user.local_suspended,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
@pytest.mark.parametrize("state", ["expired", "superseded", "cancelled", "version", "suspended"])
async def test_invitation_invalid_state_preserves_account_and_has_valid_control(
    native_context, client_factory, db_session, test_user, test_user_employee, policy, state
):
    native_context.local_mfa_policy = policy
    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    credential = mail["credential"]
    grant = await db_session.get(LocalAuthGrant, credential.split(".")[0])
    user = await db_session.get(User, uid)
    original_expiry, original_version = grant.expires_at, user.token_version
    if state in {"superseded", "cancelled"}:
        async with client_factory(
            current_user=test_user, settings=native_context, headers={"Origin": "http://test"}
        ) as admin:
            await csrf(admin)
            action = "resend" if state == "superseded" else "cancel"
            response = await admin.post(
                f"/api/v1/users/{uid}/invitations/{action}", json={"reason": "Fixture lifecycle"}
            )
            assert response.status_code == (202 if action == "resend" else 200), response.text
    elif state == "expired":
        grant.expires_at = utc_now() - timedelta(seconds=1)
    elif state == "version":
        user.token_version += 1
    else:
        user.local_suspended = True
    await db_session.commit()
    before = await account_state(db_session, uid)
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        assert (await client.get("/api/v1/auth/local/enrollment/start")).status_code == 405
        await db_session.refresh(grant)
        assert grant.consumed_at is None
        denied = await client.post(
            "/api/v1/auth/local/enrollment/start", json={"grant": credential, "password": PASSWORD}
        )
        assert denied.status_code == 401, denied.text
        assert await account_state(db_session, uid) == before
        await db_session.refresh(grant)
        assert grant.consumed_at is None
        assert not (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == uid))).scalars().all()
        assert not client.cookies.get("riskhub_refresh_token")
        if state in {"expired", "version", "suspended"}:
            # Controlled stored-state negatives; restore only the deliberately changed fact.
            grant.expires_at, user.token_version, user.local_suspended = original_expiry, original_version, False
            await db_session.commit()
        else:
            if state == "cancelled":
                await db_session.refresh(test_user)  # prior denied request rolled back its fixture session
                async with client_factory(
                    current_user=test_user, settings=native_context, headers={"Origin": "http://test"}
                ) as admin:
                    await csrf(admin)
                    response = await admin.post(
                        f"/api/v1/users/{uid}/invitations/resend", json={"reason": "Fixture reissue after cancellation"}
                    )
                    assert response.status_code == 202, response.text
            _, replacement = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
            assert replacement["credential"] != credential
            credential = replacement["credential"]
        allowed = await client.post(
            "/api/v1/auth/local/enrollment/start", json={"grant": credential, "password": PASSWORD}
        )
        assert allowed.status_code == 202, allowed.text
        assert allowed.json()["status"] == ("enrollment_required" if policy == "required" else "completed")
        assert "access_token" not in allowed.json()
        assert not client.cookies.get("riskhub_refresh_token")


@pytest.mark.asyncio
async def test_required_enrollment_resume_needs_verified_password_and_address(
    native_context, client_factory, db_session, test_user, test_user_employee
):
    native_context.local_mfa_policy = "required"
    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        before = await account_state(db_session, uid)
        raw_invited = await client.post(
            "/api/v1/auth/login", json={"email": "journey@example.com", "password": PASSWORD}
        )
        assert raw_invited.status_code == 401
        assert await account_state(db_session, uid) == before
        enrolled = await client.post(
            "/api/v1/auth/local/enrollment/start", json={"grant": mail["credential"], "password": PASSWORD}
        )
        assert enrolled.status_code == 202
        old = await db_session.get(LocalAuthGrant, enrolled.json()["challenge"].split(".")[0])
        old.expires_at = utc_now() - timedelta(seconds=1)
        await db_session.commit()
        expired_setup = await client.post(
            "/api/v1/auth/local/mfa/setup", json={"challenge": enrolled.json()["challenge"]}
        )
        assert expired_setup.status_code == 401, expired_setup.text
        wrong = await client.post("/api/v1/auth/login", json={"email": "journey@example.com", "password": "wrong"})
        assert wrong.status_code == 401
        user = await db_session.get(User, uid, populate_existing=True)
        verified_at = user.local_email_verified_at
        assert verified_at is not None and user.local_enrollment_state == "password_set"
        user.local_email_verified_at = None
        await db_session.commit()
        unverified = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
        assert unverified.status_code == 401
        user.local_email_verified_at = verified_at
        await db_session.commit()
        resumed = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
        assert resumed.status_code == 202 and resumed.json()["status"] == "enrollment_required", resumed.text
        assert resumed.json()["challenge"] != enrolled.json()["challenge"]
        assert "access_token" not in resumed.json() and not client.cookies.get("riskhub_refresh_token")
        setup = await client.post("/api/v1/auth/local/mfa/setup", json={"challenge": resumed.json()["challenge"]})
        assert setup.status_code == 200, setup.text
        assert not (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == uid))).scalars().all()


@pytest.mark.asyncio
@pytest.mark.parametrize("password,allowed", [(PASSWORD, True), ("short", False)])
async def test_native_legacy_bcrypt_upgrade_or_controlled_reset_required(
    native_context, client_factory, db_session, test_user_employee, password, allowed
):
    native_context.local_mfa_policy = "optional"
    user = test_user_employee
    user.local_enrollment_state, user.local_email_verified_at = "enrolled", utc_now()
    user.hashed_password = BcryptHasher(rounds=12).hash(password)
    old_hash, version = user.hashed_password, user.token_version
    await db_session.commit()
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        result = await client.post("/api/v1/auth/login", json={"email": user.email, "password": password})
        assert result.status_code == (200 if allowed else 401), result.text
        await db_session.refresh(user)
        assert user.token_version == version
        if allowed:
            assert user.hashed_password != old_hash and user.hashed_password.startswith("$argon2id$")
            assert verify_password(password, user.hashed_password) and not password_hash_needs_update(
                user.hashed_password
            )
            assert (
                len(
                    (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == user.id)))
                    .scalars()
                    .all()
                )
                == 1
            )
        else:
            assert user.hashed_password == old_hash
            assert not client.cookies.get("riskhub_refresh_token")
            assert (
                not (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == user.id)))
                .scalars()
                .all()
            )


@pytest.mark.asyncio
@pytest.mark.parametrize("length", [14, 15, 128, 129])
async def test_enrollment_astral_scalar_boundaries_preserve_exact_password(
    native_context, client_factory, db_session, test_user, test_user_employee, length
):
    """Wire Unicode scalars, not UTF-16 units or UTF-8 bytes, determine new-secret limits."""
    native_context.local_mfa_policy = "optional"
    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    grant_id = mail["credential"].split(".")[0]
    password = "\U0001f680" * length
    assert len(password) == length and len(password.encode()) == 4 * length
    before = await account_state(db_session, uid)
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        result = await client.post("/api/v1/auth/local/enrollment/start", json={
            "grant": mail["credential"], "password": password,
        })
        if length in {14, 129}:
            assert result.status_code == 422
            assert password not in result.text and mail["credential"] not in result.text
            assert await account_state(db_session, uid) == before
            grant = await db_session.get(LocalAuthGrant, grant_id, populate_existing=True)
            assert grant.consumed_at is None and grant.revoked_at is None
            password = "\U0001f680" * 15
            result = await client.post("/api/v1/auth/local/enrollment/start", json={
                "grant": mail["credential"], "password": password,
            })
        assert result.status_code == 202 and result.json()["status"] == "completed"
        user = await db_session.get(User, uid, populate_existing=True)
        assert verify_password(password, user.hashed_password)
        assert not verify_password(password + " ", user.hashed_password)
        grant = await db_session.get(LocalAuthGrant, grant_id, populate_existing=True)
        assert grant.consumed_at is not None
        assert not (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == uid))).scalars().all()


def test_offline_policy_reads_packaged_and_operator_lists_with_egress_denied(monkeypatch, tmp_path):
    import socket

    from app.core import password_policy
    from app.core.exceptions import ServiceFailure, ValidationError

    attempted = []

    def denied(*args, **kwargs):
        attempted.append(True)
        raise AssertionError("Password policy must not use network")

    monkeypatch.setattr(socket, "getaddrinfo", denied)
    monkeypatch.setattr(socket.socket, "connect", denied)
    password_policy._packaged_passwords.cache_clear()
    blocked = next(p for p in (password_policy.DATA_DIR / "common-passwords.txt").read_text().splitlines()
                   if 15 <= len(p) <= 128)
    with pytest.raises(ValidationError):
        password_policy.validate_local_password(blocked)
    password_policy.validate_local_password(PASSWORD)
    addition = tmp_path / "operator-blocklist"
    addition.write_text(PASSWORD + "\n")
    with pytest.raises(ValidationError):
        password_policy.validate_local_password(PASSWORD, additions_file=str(addition))
    with pytest.raises(ServiceFailure):
        password_policy.validate_local_password(PASSWORD, additions_file=str(tmp_path / "missing"))
    monkeypatch.setattr(password_policy, "DATA_DIR", tmp_path)
    with pytest.raises(ServiceFailure):
        password_policy.validate_local_password(PASSWORD)
    assert attempted == []
