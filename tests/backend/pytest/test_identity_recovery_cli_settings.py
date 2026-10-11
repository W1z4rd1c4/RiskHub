"""Real CLI dispatcher/locks/signatures with isolated DB and Redis transports."""

import argparse
import base64
import json
from contextlib import asynccontextmanager
from uuid import uuid4

import fakeredis.aioredis
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import InstallationIdentity, LocalAuthGrant, User
from app.services._local_auth.recovery_approvals import RecoveryEnvelope, canonical_envelope
from scripts import local_recovery


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ["status", "prepare", "verify", "recover"])
async def test_recovery_cli_threads_settings_through_real_locked_dispatch(
    native_context, db_session, async_engine, test_user_employee, tmp_path, monkeypatch, command
):
    target = test_user_employee
    target.local_enrollment_state = "enrolled"
    target.local_email_verified_at = utc_now()
    await db_session.commit()
    target_id, version, role_id = target.id, target.token_version, target.role_id
    binding = (await db_session.scalars(select(InstallationIdentity))).one()
    now = int(utc_now().timestamp())
    envelope = RecoveryEnvelope(
        installation_id=binding.installation_id,
        target_user_id=target_id,
        expected_token_version=version,
        operation="factor_recovery",
        nonce=uuid4().hex,
        issued_at=now,
        expires_at=now + 900,
        incident_reference="CLI-251",
        verification_method="in-person",
        reason="Synthetic CLI regression",
    )
    envelope_file = tmp_path / "envelope.json"
    envelope_file.write_text(envelope.model_dump_json())
    envelope_file.chmod(0o600)
    trust = {"version": 1, "approvers": []}
    approvals = []
    for index in (1, 2):
        key = Ed25519PrivateKey.generate()
        signer_id = f"synthetic-approver-{index}"
        trust["approvers"].append(
            {
                "id": signer_id,
                "name": f"Synthetic approver {index}",
                "public_key": base64.b64encode(
                    key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
                ).decode(),
            }
        )
        approval = tmp_path / f"approval-{index}.json"
        approval.write_text(
            json.dumps(
                {"signer_id": signer_id, "signature": base64.b64encode(key.sign(canonical_envelope(envelope))).decode()}
            )
        )
        approval.chmod(0o600)
        approvals.append(str(approval))
    trust_file = tmp_path / "approvers.json"
    trust_file.write_text(json.dumps(trust))
    trust_file.chmod(0o600)
    settings = native_context.model_copy(
        update={
            "debug": False,
            "mock_auth_enabled": False,
            "public_url": "https://test",
            "cors_origins": ["https://test"],
            "redis_url": "redis://test",
            "local_recovery_approvers_file": str(trust_file),
        }
    )

    @asynccontextmanager
    async def isolated_session(received_settings):
        assert received_settings is settings
        async with AsyncSession(async_engine, expire_on_commit=False) as session:
            yield session

    monkeypatch.setattr(local_recovery, "get_settings", lambda: settings)
    monkeypatch.setattr(local_recovery, "session_context", isolated_session)
    monkeypatch.setattr(
        local_recovery.Redis, "from_url", lambda *args, **kwargs: fakeredis.aioredis.FakeRedis(decode_responses=True)
    )
    output_file = tmp_path / "output.json"
    args = argparse.Namespace(
        command=command,
        maintenance_confirmed=True,
        target_user_id=target_id,
        operation="factor_recovery",
        incident="CLI-251",
        verification="in-person",
        reason="Synthetic CLI regression",
        output=str(output_file),
        new_email=None,
        envelope=str(envelope_file),
        approval=approvals,
    )
    result = await local_recovery.run(args)
    assert (
        result["status"]
        == {
            "status": "read-only",
            "prepare": "request-written",
            "verify": "verified-not-written",
            "recover": "recovery-pending",
        }[command]
    )
    async with AsyncSession(async_engine, expire_on_commit=False) as observer:
        saved = await observer.get(User, target_id)
        grants = list((await observer.scalars(select(LocalAuthGrant).where(LocalAuthGrant.user_id == target_id))).all())
        assert saved.role_id == role_id
        if command == "recover":
            assert saved.token_version == version + 1
            assert saved.local_recovery_pending and not saved.is_active
            assert len(grants) == 1
            assert output_file.stat().st_mode & 0o777 == 0o600
        else:
            assert saved.token_version == version and saved.is_active
            assert not saved.local_recovery_pending and not grants
