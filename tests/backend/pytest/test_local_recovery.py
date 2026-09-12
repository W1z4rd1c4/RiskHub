"""Public recovery/replacement journeys never grant partial session authority."""

import pyotp
import pytest

from app.models import LocalAuthFactor, User
from tests.backend.pytest.test_local_identity import (
    PASSWORD,
    create_invitation,
    csrf,
    enroll,
    latest_mail,
    login_native,
    login_password_only,
)

pytestmark = pytest.mark.asyncio


async def recent(client, user_id, code, operation, **extra):
    result = await client.post(
        "/api/v1/auth/local/recent-auth",
        json={
            "password": PASSWORD,
            "factor": code,
            "method": "recovery_code",
            "target_user_id": user_id,
            "operation": operation,
            **extra,
        },
    )
    assert result.status_code == 200, result.text
    return result.json()["proof"]


@pytest.mark.parametrize("operation", ["factor_replace", "recovery_codes", "abandon"])
async def test_factor_management(
    native_context, client_factory, db_session, test_user, test_user_employee, operation
):
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
        denied = await client.post(
            "/api/v1/auth/local/factor/replace", json={"recent_auth_proof": "invalid"}
        )
        assert denied.status_code == 401
        proof = await recent(
            client,
            user_id,
            codes[1],
            "factor_replace" if operation == "abandon" else operation,
        )
        path = (
            "/api/v1/auth/local/recovery-codes/regenerate"
            if operation == "recovery_codes"
            else "/api/v1/auth/local/factor/replace"
        )
        result = await client.post(path, json={"recent_auth_proof": proof})
        assert result.status_code == 200, result.text
        if operation == "abandon":
            await login_native(client, "journey@example.com", PASSWORD, codes[2])
            return
        if operation == "factor_replace":
            setup = result.json()
            old_factor = await db_session.get(
                LocalAuthFactor, user_id, populate_existing=True
            )
            old_generation = old_factor.generation
            assert old_factor.confirmed_at is not None
            body = {
                "challenge": setup["challenge"],
                "code": pyotp.parse_uri(setup["provisioning_uri"]).now(),
            }
            result = await client.post("/api/v1/auth/local/factor/confirm", json=body)
            assert result.status_code == 200, result.text
            await db_session.refresh(old_factor)
            assert old_factor.generation != old_generation
            await csrf(client)
            replay = await client.post("/api/v1/auth/local/factor/confirm", json=body)
            assert replay.status_code == 401
        new_codes = result.json()["recovery_codes"]
        assert not set(codes).intersection(new_codes)
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        await csrf(client)
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "journey@example.com", "password": PASSWORD},
        )
        old = await client.post(
            "/api/v1/auth/local/mfa/verify",
            json={
                "challenge": login.json()["challenge"],
                "code": codes[2],
                "method": "recovery_code",
            },
        )
        assert old.status_code == 401
        await login_native(client, "journey@example.com", PASSWORD, new_codes[0])


@pytest.mark.parametrize(
    "operation",
    ["factor_recovery", "credential_and_factor_recovery", "verified_address_recovery"],
)
async def test_assisted_recovery(
    native_context, client_factory, db_session, test_user, test_user_employee, operation
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
    version, role_id, original_email = (
        target.token_version,
        target.role_id,
        target.email,
    )
    new_email = (
        "replacement@example.com" if operation == "verified_address_recovery" else None
    )
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await login_password_only(client, test_user.email, PASSWORD)
        status = await client.get(f"/api/v1/users/{user_id}/local-auth/status")
        assert status.status_code == 200, status.text
        version = status.json()["authority_version"]
        proof = await recent(
            client,
            user_id,
            None,
            "assisted_recovery",
            expected_token_version=version,
            intended_recovery_operation=operation,
            intended_recovery_email=new_email,
        )
        result = await client.post(
            f"/api/v1/users/{user_id}/recovery",
            json={
                "recent_auth_proof": proof,
                "expected_token_version": version,
                "operation": operation,
                "incident_reference": "INC-test-201",
                "verification_method": "in-person",
                "reason": "Verified loss of factor",
                "new_email": new_email,
            },
        )
        assert result.status_code == 202, result.text
        _, recovery = await latest_mail(
            db_session, native_context, user_id=user_id, kind="recovery"
        )
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        denied = await client.post(
            "/api/v1/auth/login", json={"email": original_email, "password": PASSWORD}
        )
        assert denied.status_code == 401
        body = {"grant": recovery["credential"]}
        next_password = "A new independent recovery passphrase 943!"
        if operation == "credential_and_factor_recovery":
            body["new_password"] = next_password
        else:
            body["current_password"] = PASSWORD
        if new_email:
            _, mail = await latest_mail(
                db_session, native_context, user_id=user_id, kind="recovery_email"
            )
            body["verified_email_grant"] = mail["credential"]
        started = await client.post("/api/v1/auth/local/recovery/start", json=body)
        assert started.status_code == 200, started.text
        assert "access_token" not in started.json()
        completed = await client.post(
            "/api/v1/auth/local/recovery/confirm",
            json={
                "challenge": started.json()["challenge"],
                "code": pyotp.parse_uri(started.json()["provisioning_uri"]).now(),
            },
        )
        assert completed.status_code == 200, completed.text
        await db_session.refresh(target)
        assert (
            target.role_id == role_id
            and not target.local_recovery_pending
            and target.is_active
        )
        assert target.token_version == version + 2
        await login_native(
            client,
            new_email or original_email,
            next_password
            if operation == "credential_and_factor_recovery"
            else PASSWORD,
            completed.json()["recovery_codes"][0],
        )


async def run_cli(module, env, *args):
    import asyncio
    import sys
    from pathlib import Path

    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        module,
        *map(str, args),
        env=env,
        cwd=Path(__file__).resolve().parents[3] / "backend",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)
    return process.returncode, stdout.decode(), stderr.decode()


def cli_environment(settings, approvers=None):
    import json
    import os

    return {
        **os.environ,
        "DEBUG": "false",
        "MOCK_AUTH_ENABLED": "false",
        "AUTH_MODE": "password",
        "DIRECTORY_PROVIDER": "none",
        "PUBLIC_URL": "https://test",
        "CORS_ORIGINS": json.dumps(["https://test"]),
        "REDIS_URL": os.environ["TEST_REDIS_URL"],
        "LOCAL_AUTH_KEYRING_FILE": settings.local_auth_keyring_file,
        "LOCAL_RECOVERY_APPROVERS_FILE": str(approvers or ""),
        "LOCAL_SMTP_HOST": "localhost",
        "LOCAL_SMTP_SENDER": "security@example.com",
    }


@pytest.mark.parametrize("lost_key", [False, True])
async def test_offline_privileged_recovery_cli(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
    tmp_path,
    async_engine,
    lost_key,
):
    import base64
    import json

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from tests.backend.pytest.test_identity_foundations_postgres import require_postgres

    require_postgres(async_engine)
    user_id = await create_invitation(
        client_factory, native_context, db_session, test_user, test_user.role_id
    )
    _, invitation = await latest_mail(
        db_session, native_context, user_id=user_id, kind="invitation"
    )
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await enroll(client, invitation["credential"])
    unaffected_id = None
    if lost_key:
        from pathlib import Path

        # Only the affected account retains v1. A healthy account uses the new key.
        key_file = Path(native_context.local_auth_keyring_file)
        data = json.loads(key_file.read_text())
        import secrets

        data["purposes"]["totp"]["keys"]["v2"] = base64.b64encode(
            secrets.token_bytes(32)
        ).decode()
        data["purposes"]["totp"]["active"] = "v2"
        key_file.write_text(json.dumps(data))
        unaffected_id = await create_invitation(
            client_factory,
            native_context,
            db_session,
            test_user,
            test_user_employee.role_id,
            email="unaffected@example.com",
        )
        _, unaffected_mail = await latest_mail(
            db_session, native_context, user_id=unaffected_id, kind="invitation"
        )
        async with client_factory(
            settings=native_context, headers={"Origin": "http://test"}
        ) as other:
            unaffected_codes, _ = await enroll(other, unaffected_mail["credential"])
        unaffected = await db_session.get(
            LocalAuthFactor, unaffected_id, populate_existing=True
        )
        unaffected_state = (
            unaffected.generation,
            unaffected.encrypted_seed,
            unaffected.last_time_step,
        )
        del data["purposes"]["totp"]["keys"]["v1"]
        key_file.write_text(json.dumps(data))
        failed = await run_cli(
            "scripts.local_auth_keys",
            cli_environment(native_context),
            "--maintenance-confirmed",
            "verify",
        )
        assert failed[0] == 2
    test_user.local_suspended, test_user.is_active = True, False
    await db_session.commit()
    trust = {"version": 1, "approvers": []}
    for i in (1, 2):
        key = Ed25519PrivateKey.generate()
        path = tmp_path / f"private-{i}.pem"
        path.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
        path.chmod(0o600)
        trust["approvers"].append(
            {
                "id": f"operator-{i}",
                "name": f"Test approver {i}",
                "public_key": base64.b64encode(
                    key.public_key().public_bytes_raw()
                ).decode(),
            }
        )
    trust_file = tmp_path / "approvers.json"
    trust_file.write_text(json.dumps(trust))
    trust_file.chmod(0o600)
    env = cli_environment(native_context, trust_file)
    module = "scripts.local_recovery"
    envelope = tmp_path / "envelope.json"
    code, output, error = await run_cli(
        module,
        env,
        "prepare",
        "--maintenance-confirmed",
        "--target-user-id",
        user_id,
        "--operation",
        "factor_recovery",
        "--incident",
        "INC-offline",
        "--verification",
        "in-person",
        "--reason",
        "Lost device",
        "--output",
        envelope,
    )
    assert code == 0, error
    for i in (1, 2):
        result = await run_cli(
            module,
            env,
            "sign",
            "--envelope",
            envelope,
            "--private-key-file",
            tmp_path / f"private-{i}.pem",
            "--signer-id",
            f"operator-{i}",
            "--output",
            tmp_path / f"approval-{i}.json",
        )
        assert result[0] == 0, result[2]
    args = [
        "--maintenance-confirmed",
        "--envelope",
        envelope,
        "--approval",
        tmp_path / "approval-1.json",
    ]
    single = await run_cli(module, env, "verify", *args)
    assert single[0] == 2
    duplicate = await run_cli(
        module, env, "verify", *args, "--approval", tmp_path / "approval-1.json"
    )
    assert duplicate[0] == 2
    args += ["--approval", tmp_path / "approval-2.json"]
    verified = await run_cli(module, env, "verify", *args)
    assert verified[0] == 0, verified[2]
    output_file = tmp_path / "grant.json"
    result = await run_cli(module, env, "recover", *args, "--output", output_file)
    assert result[0] == 0, result[2]
    grant = json.loads(output_file.read_text())["grant"]
    assert grant not in result[1] + result[2]
    assert output_file.stat().st_mode & 0o077 == 0
    replay = await run_cli(
        module, env, "recover", *args, "--output", tmp_path / "replayed.json"
    )
    assert replay[0] == 2
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        started = await client.post(
            "/api/v1/auth/local/recovery/start",
            json={"grant": grant, "current_password": PASSWORD},
        )
        assert started.status_code == 200, started.text
        completed = await client.post(
            "/api/v1/auth/local/recovery/confirm",
            json={
                "challenge": started.json()["challenge"],
                "code": pyotp.parse_uri(started.json()["provisioning_uri"]).now(),
            },
        )
        assert completed.status_code == 200, completed.text
        await login_native(
            client,
            "journey@example.com",
            PASSWORD,
            completed.json()["recovery_codes"][0],
        )
    target = await db_session.get(User, user_id, populate_existing=True)
    assert (
        target.role_id == test_user.role_id
        and target.is_active
        and not target.local_recovery_pending
    )

    if lost_key:
        assert native_context.local_mfa_policy == "required"
        affected = await db_session.get(
            LocalAuthFactor, user_id, populate_existing=True
        )
        assert affected.key_id == "v2"
        unaffected = await db_session.get(
            LocalAuthFactor, unaffected_id, populate_existing=True
        )
        assert (
            unaffected.generation,
            unaffected.encrypted_seed,
            unaffected.last_time_step,
        ) == unaffected_state
        async with client_factory(
            settings=native_context, headers={"Origin": "http://test"}
        ) as other:
            await login_native(
                other, "unaffected@example.com", PASSWORD, unaffected_codes[0]
            )
        verified = await run_cli(
            "scripts.local_auth_keys", env, "--maintenance-confirmed", "verify"
        )
        assert verified[0] == 0, verified[2]


async def test_recovery_approval_abuse_cases(tmp_path):
    import base64
    import json
    from uuid import uuid4

    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from app.core.datetime_utils import utc_now
    from app.core.exceptions import AuthenticationError
    from app.services._local_auth.recovery_approvals import (
        RecoveryEnvelope,
        canonical_envelope,
        verify_approvals,
    )

    now = int(utc_now().timestamp())
    envelope = RecoveryEnvelope(
        installation_id=str(uuid4()),
        target_user_id=7,
        expected_token_version=2,
        operation="factor_recovery",
        nonce=uuid4().hex,
        issued_at=now,
        expires_at=now + 900,
        incident_reference="INC-1",
        verification_method="in-person",
        reason="Lost factor",
    )
    keys = [Ed25519PrivateKey.generate(), Ed25519PrivateKey.generate()]
    trust = tmp_path / "trust.json"
    trust.write_text(
        json.dumps(
            {
                "version": 1,
                "approvers": [
                    {
                        "id": str(i),
                        "name": f"Person {i}",
                        "public_key": base64.b64encode(
                            key.public_key().public_bytes_raw()
                        ).decode(),
                    }
                    for i, key in enumerate(keys)
                ],
            }
        )
    )
    trust.chmod(0o600)
    signatures = [
        {
            "signer_id": str(i),
            "signature": base64.b64encode(
                key.sign(canonical_envelope(envelope))
            ).decode(),
        }
        for i, key in enumerate(keys)
    ]
    assert verify_approvals(envelope, signatures, str(trust)) == ["0", "1"]
    for invalid in [
        signatures[:1],
        [signatures[0], signatures[0]],
        [
            {"signer_id": "unknown", "signature": signatures[0]["signature"]},
            signatures[1],
        ],
    ]:
        with pytest.raises(AuthenticationError):
            verify_approvals(envelope, invalid, str(trust))
    for change in [
        {"target_user_id": 8},
        {"expected_token_version": 3},
        {"installation_id": str(uuid4())},
        {"operation": "credential_and_factor_recovery"},
        {"expires_at": now - 1},
        {"expires_at": now + 901},
    ]:
        with pytest.raises(AuthenticationError):
            verify_approvals(envelope.model_copy(update=change), signatures, str(trust))


async def test_key_rotation_cli_preserves_factor_state(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
    tmp_path,
    async_engine,
):
    import json

    from tests.backend.pytest.test_identity_foundations_postgres import require_postgres

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
        codes, setup = await enroll(client, invitation["credential"])
        await login_native(client, "journey@example.com", PASSWORD, codes[0])
    factor = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
    original = factor.generation, factor.last_time_step
    await db_session.rollback()
    env, module = cli_environment(native_context), "scripts.local_auth_keys"
    for purpose in ["totp", "delivery", "action"]:
        for command in ["add", "activate"]:
            result = await run_cli(
                module,
                env,
                "--maintenance-confirmed",
                command,
                "--purpose",
                purpose,
                "--key-id",
                "v2",
            )
            assert result[0] == 0, result[2]
    inventory = tmp_path / "backups.json"
    inventory.write_text(json.dumps({"version": 1, "retained_backups": []}))
    inventory.chmod(0o600)
    early = await run_cli(
        module,
        env,
        "--maintenance-confirmed",
        "retire",
        "--purpose",
        "totp",
        "--key-id",
        "v1",
        "--retained-backups-file",
        inventory,
    )
    assert early[0] == 2
    cursor = 0
    while True:
        result = await run_cli(
            module,
            env,
            "--maintenance-confirmed",
            "reencrypt",
            "--batch-size",
            1,
            "--after-user-id",
            cursor,
        )
        assert result[0] == 0, result[2]
        progress = json.loads(result[1])
        cursor = progress["next_after_user_id"]
        if progress["done"]:
            break
    repeated = await run_cli(module, env, "--maintenance-confirmed", "reencrypt")
    assert repeated[0] == 0 and json.loads(repeated[1])["references_changed"] == 0
    verified = await run_cli(module, env, "--maintenance-confirmed", "verify")
    assert verified[0] == 0, verified[2]
    inventory.write_text(
        json.dumps(
            {
                "version": 1,
                "retained_backups": [
                    {
                        "id": "retained-before-rotation",
                        "key_ids": {
                            "totp": ["v1"],
                            "delivery": ["v1"],
                            "action": ["v1"],
                        },
                    }
                ],
            }
        )
    )
    protected = await run_cli(
        module,
        env,
        "--maintenance-confirmed",
        "retire",
        "--purpose",
        "totp",
        "--key-id",
        "v1",
        "--retained-backups-file",
        inventory,
    )
    assert protected[0] == 2
    inventory.write_text(json.dumps({"version": 1, "retained_backups": []}))
    retired = await run_cli(
        module,
        env,
        "--maintenance-confirmed",
        "retire",
        "--purpose",
        "totp",
        "--key-id",
        "v1",
        "--retained-backups-file",
        inventory,
    )
    assert retired[0] == 0, retired[2]
    factor = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
    assert factor.key_id == "v2"
    assert (factor.generation, factor.last_time_step) == original
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await login_native(client, "journey@example.com", PASSWORD, codes[1])


@pytest.mark.parametrize("role_kind", ["admin", "cro", "global_access"])
async def test_privileged_recovery_is_rejected_on_web(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_cro,
    test_user_employee,
    role_kind,
):
    from app.core.datetime_utils import utc_now
    from app.core.security import get_password_hash
    from app.models.user import AccessScope

    native_context.local_mfa_policy = "optional"
    test_user.hashed_password = get_password_hash(PASSWORD)
    test_user.local_email_verified_at = utc_now()
    test_user.local_enrollment_state = "enrolled"
    target = test_user if role_kind == "admin" else test_user_cro
    if role_kind == "global_access":
        from app.models import Permission, Role, RolePermission

        role = Role(name="custom_access_manager", display_name="Custom access manager")
        permission = Permission(resource="users", action="write")
        db_session.add_all([role, permission])
        await db_session.flush()
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        target = test_user_employee
        target.role_id, target.access_scope = role.id, AccessScope.GLOBAL
    target.local_email_verified_at = utc_now()
    target.local_enrollment_state = "enrolled"
    await db_session.commit()
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await login_password_only(client, test_user.email, PASSWORD)
        result = await client.post(
            "/api/v1/auth/local/recent-auth",
            json={
                "password": PASSWORD,
                "target_user_id": target.id,
                "operation": "assisted_recovery",
                "expected_token_version": target.token_version,
                "intended_recovery_operation": "factor_recovery",
            },
        )
        assert result.status_code == 401, result.text
        await db_session.refresh(target)
        assert not target.local_recovery_pending


@pytest.mark.parametrize("damage", ["missing", "wrong"])
async def test_protected_key_backup_restores_affected_login(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
    tmp_path,
    async_engine,
    damage,
):
    import base64
    import json
    import secrets
    from pathlib import Path

    from tests.backend.pytest.test_identity_foundations_postgres import require_postgres

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
        codes, setup = await enroll(client, invitation["credential"])
        await login_native(client, "journey@example.com", PASSWORD, codes[0])
        before = await db_session.get(LocalAuthFactor, user_id, populate_existing=True)
        state = before.generation, before.encrypted_seed, before.last_time_step
        key_file = Path(native_context.local_auth_keyring_file)
        backup = tmp_path / "protected-key-backup.json"
        backup.write_bytes(key_file.read_bytes())
        backup.chmod(0o600)
        data = json.loads(backup.read_text())
        entry = data["purposes"]["totp"]
        fresh = base64.b64encode(secrets.token_bytes(32)).decode()
        if damage == "missing":
            entry.update(active="v2", keys={"v2": fresh})
        else:
            entry["keys"]["v1"] = fresh
        key_file.write_text(json.dumps(data))
        env = cli_environment(native_context)
        result = await run_cli(
            "scripts.local_auth_keys", env, "--maintenance-confirmed", "verify"
        )
        assert result[0] == 2
        await csrf(client)
        challenge = await client.post(
            "/api/v1/auth/login",
            json={"email": "journey@example.com", "password": PASSWORD},
        )
        assert challenge.status_code == 202
        denied = await client.post(
            "/api/v1/auth/local/mfa/verify",
            json={
                "challenge": challenge.json()["challenge"],
                "method": "totp",
                "code": pyotp.parse_uri(setup["provisioning_uri"]).now(),
            },
        )
        assert denied.status_code == 503, denied.text
        assert "access_token" not in denied.json()
        key_file.write_bytes(backup.read_bytes())
        restored = await run_cli(
            "scripts.local_auth_keys", env, "--maintenance-confirmed", "verify"
        )
        assert restored[0] == 0, restored[2]
        await db_session.refresh(before)
        assert (
            before.generation,
            before.encrypted_seed,
            before.last_time_step,
        ) == state
        assert native_context.local_mfa_policy == "required"
        await login_native(client, "journey@example.com", PASSWORD, codes[1])
