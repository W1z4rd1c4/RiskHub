"""Rebuilt #199 evidence: cipher availability, real UTC TOTP tolerance and replay.

This is a new candidate after workspace loss; prior test results do not certify it.
"""

import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pyotp
import pytest
from sqlalchemy import select

from app.core.datetime_utils import utc_now
from app.core.security import decode_access_token
from app.core.tokens import decode_refresh_token
from app.models import LocalAuthFactor, LocalAuthGrant, RefreshToken
from app.services._local_auth import factors
from tests.backend.pytest.test_local_identity import PASSWORD, create_invitation, csrf, enroll, latest_mail


async def pending(client):
    await csrf(client)
    result = await client.post("/api/v1/auth/login", json={"email": "journey@example.com", "password": PASSWORD})
    assert result.status_code == 202 and result.json()["status"] == "mfa_required", result.text
    assert "access_token" not in result.json()
    return result.json()["challenge"]


async def verify(client, challenge, code):
    return await client.post(
        "/api/v1/auth/local/mfa/verify", json={"challenge": challenge, "method": "totp", "code": code}
    )


async def rows(db, uid):
    return (await db.execute(select(RefreshToken).where(RefreshToken.user_id == uid))).scalars().all()


async def assert_session(db, client, result, settings, uid, challenge):
    assert result.status_code == 200, result.text
    access = decode_access_token(result.json()["access_token"], settings=settings)
    refresh = decode_refresh_token(client.cookies["riskhub_refresh_token"], settings)
    assert access["user_id"] == refresh["user_id"] == uid
    assert access["auth_method"] == refresh["auth_method"] == "local_mfa"
    row = await db.scalar(select(RefreshToken).where(RefreshToken.jti == refresh["jti"]))
    assert row is not None and row.user_id == uid and row.revoked_at is None
    grant = await db.get(LocalAuthGrant, challenge.split(".")[0], populate_existing=True)
    assert grant.consumed_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
@pytest.mark.parametrize("damage", ["base64", "truncated", "ciphertext", "needed_key"])
async def test_factor_security_unavailable_preserves_artifact_for_real_restoration(
    native_context, client_factory, db_session, test_user, test_user_employee, monkeypatch, policy, damage
):
    native_context.local_mfa_policy = "required"
    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, invitation = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        _, setup = await enroll(client, invitation["credential"])
        native_context.local_mfa_policy = policy
        challenge = await pending(client)
        factor = await db_session.get(LocalAuthFactor, uid, populate_existing=True)
        original = (factor.key_id, factor.encrypted_seed, factor.last_time_step, factor.generation)
        clock = datetime.fromtimestamp((int(utc_now().timestamp()) // 30 + 3) * 30, UTC)
        monkeypatch.setattr(factors, "utc_now", lambda: clock)
        code = pyotp.parse_uri(setup["provisioning_uri"]).at(clock)
        keyfile = Path(native_context.local_auth_keyring_file)
        original_keyfile = keyfile.read_bytes()
        if damage == "needed_key":
            # A valid keyring with a new active key, but without this factor's historical key.
            data = json.loads(original_keyfile)
            purpose = data["purposes"]["totp"]
            replacement = "replacement-test-key"
            purpose["keys"][replacement] = base64.b64encode(b"R" * 32).decode()
            purpose["active"] = replacement
            del purpose["keys"][factor.key_id]
            keyfile.write_text(json.dumps(data))
        elif damage == "base64":
            factor.encrypted_seed = "not valid base64!"
        elif damage == "truncated":
            factor.encrypted_seed = base64.b64encode(b"short").decode()
        else:
            raw = bytearray(base64.b64decode(factor.encrypted_seed))
            raw[-1] ^= 1
            factor.encrypted_seed = base64.b64encode(raw).decode()
        await db_session.commit()
        try:
            denied = await verify(client, challenge, code)
            assert denied.status_code == 503, denied.text
            assert not await rows(db_session, uid)
            await db_session.refresh(factor)
            grant = await db_session.get(LocalAuthGrant, challenge.split(".")[0], populate_existing=True)
            assert grant.consumed_at is None and grant.revoked_at is None
            assert factor.last_time_step == original[2] and factor.generation == original[3]
        finally:
            keyfile.write_bytes(original_keyfile)
            factor.key_id, factor.encrypted_seed = original[:2]
            await db_session.commit()
        restored = await verify(client, challenge, code)
        await assert_session(db_session, client, restored, native_context, uid, challenge)
        await db_session.refresh(factor)
        assert factor.last_time_step == int(clock.timestamp()) // 30
        assert len(await rows(db_session, uid)) == 1


@pytest.mark.parametrize("microseconds", [-1, 0, 1])
@pytest.mark.parametrize("offset", [-2, -1, 0, 1, 2])
def test_real_totp_thirty_second_tolerance_and_replay(monkeypatch, microseconds, offset):
    clock = datetime(2030, 1, 2, 3, 4, 0, tzinfo=UTC) + timedelta(microseconds=microseconds)
    step = int(clock.timestamp()) // 30
    seed = "JBSWY3DPEHPK3PXP"
    generator = pyotp.TOTP(seed)
    codes = [generator.at((step + delta) * 30) for delta in range(-2, 3)]
    assert len(set(codes)) == len(codes), "Fixture codes must not collide"
    monkeypatch.setattr(factors, "utc_now", lambda: clock)
    expected = step + offset if abs(offset) <= 1 else None
    assert factors.match_totp_step(seed, codes[offset + 2]) == expected
    if expected is not None:
        assert factors.match_totp_step(seed, codes[offset + 2], last_step=expected) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
@pytest.mark.parametrize("microseconds", [-1, 0, 1])
async def test_public_totp_boundary_persists_counter_grant_and_signed_session(
    native_context, client_factory, db_session, test_user, test_user_employee, monkeypatch, policy, microseconds
):
    native_context.local_mfa_policy = "required"
    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, invitation = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        _, setup = await enroll(client, invitation["credential"])
        native_context.local_mfa_policy = policy
        generator = pyotp.parse_uri(setup["provisioning_uri"])
        boundary = datetime.fromtimestamp((int(utc_now().timestamp()) // 30 + 3) * 30, UTC)
        clock = boundary + timedelta(microseconds=microseconds)
        monkeypatch.setattr(factors, "utc_now", lambda: clock)
        step = int(clock.timestamp()) // 30
        code, newer = generator.at(step * 30), generator.at((step + 1) * 30)
        assert len({generator.at((step + n) * 30) for n in [-1, 0, 1]}) == 3
        first = await pending(client)
        result = await verify(client, first, code)
        await assert_session(db_session, client, result, native_context, uid, first)
        factor = await db_session.get(LocalAuthFactor, uid, populate_existing=True)
        generation = factor.generation
        assert factor.last_time_step == step and len(await rows(db_session, uid)) == 1
        second = await pending(client)
        denied = await verify(client, second, code)
        assert denied.status_code == 401, denied.text
        await db_session.refresh(factor)
        grant = await db_session.get(LocalAuthGrant, second.split(".")[0], populate_existing=True)
        assert factor.last_time_step == step and factor.generation == generation
        assert grant.consumed_at is None and grant.revoked_at is None
        assert len(await rows(db_session, uid)) == 1
        # Failed-factor bookkeeping may increment; it must not spend a newer valid factor.
        result = await verify(client, second, newer)
        await assert_session(db_session, client, result, native_context, uid, second)
        await db_session.refresh(factor)
        assert factor.last_time_step == step + 1 and factor.generation == generation
        assert len(await rows(db_session, uid)) == 2
