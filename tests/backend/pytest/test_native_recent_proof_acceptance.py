"""Public recent-proof boundaries without session-revocation shortcuts (#199)."""

from datetime import timedelta

import pytest
from freezegun import freeze_time
from sqlalchemy import select

from app.core.datetime_utils import coerce_utc
from app.core.tokens import decode_refresh_token
from app.models import LocalAuthGrant, RefreshToken, User
from tests.backend.pytest.test_local_identity import (
    PASSWORD,
    create_invitation,
    csrf,
    enroll,
    latest_mail,
    login_native,
    login_password_only,
)
from tests.backend.pytest.test_native_session_acceptance import ORIGIN


async def account(client, db, settings, invitation, email, factor):
    if factor:
        selected = settings.local_mfa_policy
        settings.local_mfa_policy = "required"
        codes, _ = await enroll(client, invitation)
        settings.local_mfa_policy = selected
        token = await login_native(client, email, PASSWORD, codes[0])
    else:
        codes = []
        await csrf(client)
        result = await client.post(
            "/api/v1/auth/local/enrollment/start", json={"grant": invitation, "password": PASSWORD}
        )
        assert result.status_code == 202 and result.json()["status"] == "completed"
        token = await login_password_only(client, email)
    return codes, token


async def recent(client, user_id, codes, *, index=1, target=None):
    data = {
        "password": PASSWORD,
        "target_user_id": user_id if target is None else target,
        "operation": "password_change",
        "intended_password": PASSWORD,
    }
    if codes:
        data.update(factor=codes[index], method="recovery_code")
    return await client.post("/api/v1/auth/local/recent-auth", json=data)


async def consume_unchanged(client, proof, **kwargs):
    return await client.post(
        "/api/v1/auth/local/password/change",
        json={"recent_auth_proof": proof, "password": PASSWORD},
        **kwargs,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("policy,factor", [("required", True), ("optional", True), ("optional", False)])
async def test_recent_proof_single_use_without_revocation_and_without_age_reset(
    native_context, client_factory, db_session, test_user, test_user_employee, policy, factor
):
    native_context.local_mfa_policy = policy
    with freeze_time(ORIGIN, real_asyncio=True):
        uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
        _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            codes, token = await account(
                client, db_session, native_context, mail["credential"], "journey@example.com", factor
            )
            user = await db_session.get(User, uid)
            version, password_hash = user.token_version, user.hashed_password
            before = decode_refresh_token(client.cookies["riskhub_refresh_token"], native_context)
            with freeze_time(ORIGIN + timedelta(minutes=10), real_asyncio=True):
                result = await recent(client, uid, codes)
                assert result.status_code == 200, result.text
                raw = result.json()["proof"]
                grant = await db_session.get(LocalAuthGrant, raw.split(".")[0], populate_existing=True)
                assert coerce_utc(grant.expires_at) - coerce_utc(grant.issued_at) == timedelta(minutes=5)
                assert grant.token_version == version and grant.consumed_at is None
                consumed = await consume_unchanged(client, raw)
                assert consumed.status_code == 200 and consumed.json()["reauthentication_required"] is False
                await db_session.refresh(user)
                await db_session.refresh(grant)
                assert user.token_version == version and user.hashed_password == password_hash
                assert grant.consumed_at is not None
                rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == uid))).all())
                assert len(rows) == 1 and rows[0].revoked_at is None
                # Same bearer remains usable: replay cannot be rejected merely
                # because the first action revoked the account/session.
                assert (
                    await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer " + token})
                ).status_code == 200
                grants_before = list(
                    (
                        await db_session.scalars(
                            select(LocalAuthGrant.id).where(LocalAuthGrant.user_id == uid).order_by(LocalAuthGrant.id)
                        )
                    ).all()
                )
                replay = await consume_unchanged(client, raw)
                assert replay.status_code == 401, replay.text
                assert (await client.get("/api/v1/auth/me")).status_code == 200
                await db_session.refresh(user)
                assert (user.token_version, user.hashed_password) == (version, password_hash)
                assert (
                    list(
                        (
                            await db_session.scalars(
                                select(LocalAuthGrant.id)
                                .where(LocalAuthGrant.user_id == uid)
                                .order_by(LocalAuthGrant.id)
                            )
                        ).all()
                    )
                    == grants_before
                )
                assert (
                    len(
                        list(
                            (await db_session.scalars(select(RefreshToken.id).where(RefreshToken.user_id == uid))).all()
                        )
                    )
                    == 1
                )
                refreshed = await client.post("/api/v1/auth/refresh")
                assert refreshed.status_code == 200, refreshed.text
                after = decode_refresh_token(client.cookies["riskhub_refresh_token"], native_context)
                assert (after["auth_time"], after["session_exp"]) == (before["auth_time"], before["session_exp"])
                child = await db_session.scalar(select(RefreshToken).where(RefreshToken.jti == after["jti"]))
                assert coerce_utc(child.authenticated_at) == ORIGIN
                assert coerce_utc(child.expires_at) == ORIGIN + timedelta(hours=8)


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
@pytest.mark.parametrize("elapsed", [299, 300, 301])
async def test_recent_proof_five_minute_expiry_with_fresh_positive_control(
    native_context, client_factory, db_session, test_user, test_user_employee, policy, elapsed
):
    native_context.local_mfa_policy = policy
    with freeze_time(ORIGIN, real_asyncio=True):
        uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
        _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            codes, _ = await account(
                client, db_session, native_context, mail["credential"], "journey@example.com", policy == "required"
            )
            proof = await recent(client, uid, codes)
            assert proof.status_code == 200, proof.text
            raw = proof.json()["proof"]
            with freeze_time(ORIGIN + timedelta(seconds=elapsed), real_asyncio=True):
                response = await consume_unchanged(client, raw)
                assert response.status_code == (200 if elapsed < 300 else 401), response.text
                grant = await db_session.get(LocalAuthGrant, raw.split(".")[0], populate_existing=True)
                assert (grant.consumed_at is not None) == (elapsed < 300)
                assert (await client.get("/api/v1/auth/me")).status_code == 200
                fresh = await recent(client, uid, codes, index=2)
                assert fresh.status_code == 200, fresh.text
                assert (await consume_unchanged(client, fresh.json()["proof"])).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
@pytest.mark.parametrize("mismatch", ["action", "change", "target", "actor", "version", "stored_target"])
async def test_recent_proof_binding_has_real_positive_control(
    native_context, client_factory, db_session, test_user, test_user_employee, policy, mismatch
):
    native_context.local_mfa_policy = policy
    with freeze_time(ORIGIN, real_asyncio=True):
        uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
        _, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            codes, _ = await account(
                client, db_session, native_context, mail["credential"], "journey@example.com", policy == "required"
            )
            if mismatch == "target":
                denied = await recent(client, uid, codes, target=test_user.id)
                assert denied.status_code == 403, denied.text
            proof = await recent(client, uid, codes)
            assert proof.status_code == 200, proof.text
            raw = proof.json()["proof"]
            if mismatch == "action":
                denied = await client.post(
                    "/api/v1/auth/local/email/change",
                    json={
                        "recent_auth_proof": raw,
                        "new_email": "unused-target@example.com",
                    },
                )
            elif mismatch == "change":
                denied = await client.post(
                    "/api/v1/auth/local/password/change",
                    json={
                        "recent_auth_proof": raw,
                        "password": "Different intended passphrase 88!",
                    },
                )
            elif mismatch == "stored_target":
                # Defense-in-depth stored-artifact mismatch, not a client-writable
                # request field. Preserve the genuinely issued proof commitment.
                target_grant = await db_session.get(LocalAuthGrant, raw.split(".")[0], populate_existing=True)
                original_context = dict(target_grant.context)
                target_grant.context = {**original_context, "target": test_user.id}
                await db_session.commit()
                await db_session.refresh(target_grant)
                assert target_grant.context["target"] != uid
                assert target_grant.context["intent"] == original_context["intent"]
                denied = await consume_unchanged(client, raw)
            elif mismatch == "actor":
                other_id = await create_invitation(
                    client_factory,
                    native_context,
                    db_session,
                    test_user,
                    test_user_employee.role_id,
                    email="other-proof@example.com",
                )
                _, other_mail = await latest_mail(db_session, native_context, user_id=other_id, kind="invitation")
                async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as other:
                    _, other_token = await account(
                        other,
                        db_session,
                        native_context,
                        other_mail["credential"],
                        "other-proof@example.com",
                        policy == "required",
                    )
                # Retain the original browser/CSRF binding and swap only a valid
                # independently authenticated actor's bearer.
                assert (await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer " + other_token})).json()[
                    "id"
                ] == other_id
                denied = await consume_unchanged(client, raw, headers={"Authorization": "Bearer " + other_token})
            elif mismatch == "version":
                user = await db_session.get(User, uid)
                user.token_version += 1  # Controlled authority-version seam, no grant revocation shortcut.
                await db_session.commit()
                if codes:
                    await login_native(client, user.email, PASSWORD, codes[2])
                else:
                    await login_password_only(client, user.email)
                assert (await client.get("/api/v1/auth/me")).status_code == 200
                denied = await consume_unchanged(client, raw)
            if mismatch != "target":
                assert denied.status_code == 401, denied.text
            grant = await db_session.get(LocalAuthGrant, raw.split(".")[0], populate_existing=True)
            assert grant.consumed_at is None and grant.revoked_at is None
            if mismatch == "stored_target":
                grant.context = original_context
                await db_session.commit()
                await db_session.refresh(grant)
                assert grant.context["target"] == uid
            if mismatch == "version":
                await db_session.refresh(user)
                assert grant.token_version == user.token_version - 1
                assert coerce_utc(grant.expires_at) == ORIGIN + timedelta(minutes=5)
                fresh = await recent(client, uid, codes, index=3)
                assert fresh.status_code == 200, fresh.text
                raw = fresh.json()["proof"]
            # Wrong intent/actor does not consume a valid proof; exact authorized
            # action still succeeds. Version case needs a genuinely fresh proof.
            assert (await consume_unchanged(client, raw)).status_code == 200
