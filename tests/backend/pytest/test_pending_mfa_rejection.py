"""Pending-MFA authority/binding rejection with real valid-factor controls (#199)."""

from datetime import timedelta
from uuid import uuid4

import pyotp
import pytest
from sqlalchemy import func, select

from app.core.datetime_utils import utc_now
from app.core.security import decode_access_token
from app.models import LocalAuthFactor, LocalAuthGrant, LocalAuthRecoveryCode, RefreshToken, User
from app.services._local_auth.keys import LocalKeyring
from tests.backend.pytest.test_local_identity import PASSWORD, create_invitation, csrf, enroll, latest_mail


async def challenge(client, password):
    response = await client.post("/api/v1/auth/login", json={"email": "journey@example.com", "password": password})
    assert response.status_code == 202 and response.json()["status"] == "mfa_required", response.text
    assert "access_token" not in response.json()
    return response.json()["challenge"]


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
@pytest.mark.parametrize(
    "scenario", ["suspension", "version", "password_reset", "generation", "browser", "purpose", "expiry"]
)
async def test_pending_mfa_rejects_changed_authority_or_binding_without_spending_valid_factor(
    native_context, client_factory, db_session, test_user, test_user_employee, policy, scenario
):
    # Enrollment is genuine required-policy setup; optional then retains the confirmed factor.
    native_context.local_mfa_policy = "required"
    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, invitation = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        codes, _ = await enroll(client, invitation["credential"])
        native_context.local_mfa_policy = policy
        pending = await challenge(client, PASSWORD)
        original_browser = client.cookies["riskhub_local_challenge"]
        supplied = pending
        password = PASSWORD
        method, code = "recovery_code", codes[0]
        user = await db_session.get(User, uid, populate_existing=True)
        factor = await db_session.get(LocalAuthFactor, uid, populate_existing=True)
        grant = await db_session.get(LocalAuthGrant, pending.split(".")[0], populate_existing=True)
        original_version = user.token_version
        if scenario == "suspension":
            # Isolate readiness from version/revocation: a controlled DB seam,
            # not a claim about a new public suspension route.
            user.local_suspended = True
            await db_session.commit()
        elif scenario == "version":
            user.token_version += 1
            await db_session.commit()
        elif scenario == "password_reset":
            reset = await client.post("/api/v1/auth/local/password/reset/request", json={"email": user.email})
            assert reset.status_code == 202, reset.text
            _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="reset")
            password = "A newly reset independent passphrase 84!"
            reset = await client.post(
                "/api/v1/auth/local/password/reset/complete",
                json={
                    "grant": mail["credential"],
                    "password": password,
                },
            )
            assert reset.status_code == 200, reset.text
            # Reset intentionally clears browser CSRF state; acquire a fresh
            # valid CSRF pair before testing the retained MFA grant itself.
            await csrf(client)
        elif scenario == "generation":
            # Change only factor generation/seed state without version change
            # so the verifier's generation check is independently exercised.
            seed, generation = pyotp.random_base32(), uuid4().hex
            key_id, encrypted = LocalKeyring.load(native_context.local_auth_keyring_file).encrypt(
                "totp", seed, [grant.installation_id, str(uid), generation]
            )
            factor.generation, factor.key_id, factor.encrypted_seed = generation, key_id, encrypted
            factor.last_time_step = -1
            await db_session.commit()
            code_at = utc_now()
            method, code = "totp", pyotp.TOTP(seed).at(code_at)
        elif scenario == "browser":
            client.cookies.set("riskhub_local_challenge", "A" * 43, domain="test.local", path="/api/v1")
        elif scenario == "purpose":
            reset = await client.post("/api/v1/auth/local/password/reset/request", json={"email": user.email})
            assert reset.status_code == 202, reset.text
            _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="reset")
            supplied = mail["credential"]  # Real unconsumed reset authority, not a consumed setup artifact.
        if scenario == "expiry":
            grant.expires_at = utc_now() - timedelta(seconds=1)
            await db_session.commit()
        await db_session.refresh(factor)
        before_step = factor.last_time_step
        before_used = await db_session.scalar(
            select(func.count())
            .select_from(LocalAuthRecoveryCode)
            .where(LocalAuthRecoveryCode.user_id == uid, LocalAuthRecoveryCode.consumed_at.is_not(None))
        )
        assert before_used == 0
        denied = await client.post(
            "/api/v1/auth/local/mfa/verify",
            json={
                "challenge": supplied,
                "code": code,
                "method": method,
            },
        )
        assert denied.status_code == 401 and "access_token" not in denied.json(), denied.text
        assert not client.cookies.get("riskhub_refresh_token")
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        await db_session.refresh(factor)
        await db_session.refresh(grant)
        await db_session.refresh(user)
        assert grant.consumed_at is None and factor.last_time_step == before_step
        assert (
            await db_session.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == uid))
            == 0
        )
        assert (
            await db_session.scalar(
                select(func.count())
                .select_from(LocalAuthRecoveryCode)
                .where(LocalAuthRecoveryCode.user_id == uid, LocalAuthRecoveryCode.consumed_at.is_not(None))
            )
            == 0
        )
        if scenario == "password_reset":
            assert user.token_version == original_version + 1 and grant.revoked_at is not None
        elif scenario == "version":
            assert user.token_version == original_version + 1 and grant.revoked_at is None
        else:
            assert user.token_version == original_version
        if scenario == "purpose":
            wrong = await db_session.get(LocalAuthGrant, supplied.split(".")[0], populate_existing=True)
            assert wrong.purpose == "reset" and wrong.consumed_at is None and wrong.revoked_at is None
        if scenario == "suspension":
            user.local_suspended = False
            await db_session.commit()
        if scenario == "browser":
            client.cookies.set("riskhub_local_challenge", original_browser, domain="test.local", path="/api/v1")
        # Browser/purpose controls can use the original unspent MFA grant.
        # Changed authority/expiry uses a new real grant, never rolls back
        # the version or resurrects a revoked/expired challenge.
        valid = pending if scenario in {"browser", "purpose"} else await challenge(client, password)
        if scenario == "generation":
            from app.services._local_auth.factors import match_totp_step

            current_grant = await db_session.get(LocalAuthGrant, valid.split(".")[0], populate_existing=True)
            await db_session.refresh(factor)
            assert current_grant.factor_generation == factor.generation == generation
            decrypted = LocalKeyring.load(native_context.local_auth_keyring_file).decrypt(
                "totp",
                factor.key_id,
                factor.encrypted_seed,
                [current_grant.installation_id, str(uid), factor.generation],
            )
            assert decrypted == seed
            assert match_totp_step(decrypted, code, last_step=factor.last_time_step) is not None, (
                factor.last_time_step,
                code == pyotp.TOTP(decrypted).at(code_at),
                code_at,
            )
        accepted = await client.post(
            "/api/v1/auth/local/mfa/verify",
            json={
                "challenge": valid,
                "code": code,
                "method": method,
            },
        )
        assert accepted.status_code == 200, accepted.text
        claims = decode_access_token(accepted.json()["access_token"], settings=native_context)
        assert claims["user_id"] == uid and claims["auth_method"] == "local_mfa"
        assert (
            await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer " + accepted.json()["access_token"]})
        ).status_code == 200
        assert (
            await db_session.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == uid))
            == 1
        )
        await db_session.refresh(factor)
        if scenario == "generation":
            assert factor.last_time_step == int(code_at.timestamp()) // 30
        else:
            assert (
                await db_session.scalar(
                    select(func.count())
                    .select_from(LocalAuthRecoveryCode)
                    .where(LocalAuthRecoveryCode.user_id == uid, LocalAuthRecoveryCode.consumed_at.is_not(None))
                )
                == 1
            )
