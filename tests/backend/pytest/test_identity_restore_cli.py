"""Real PostgreSQL dump/restore, key-file, Redis and subprocess cutover drills."""

import json
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
from redis.asyncio import Redis
from sqlalchemy.engine import make_url

from app.core.datetime_utils import utc_now
from app.core.security import create_access_token, decode_access_token, get_password_hash
from app.core.tokens import create_refresh_token, decode_refresh_token
from app.db.session import session_context
from app.models import InstallationIdentity, LocalAuthFactor, Risk, User
from app.services._identity_restore.postgres import dump_database, restore_database
from tests.backend.pytest.test_identity_foundations_postgres import require_postgres
from tests.backend.pytest.test_local_recovery import run_cli

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.postgres,
    pytest.mark.skipif(not os.environ.get("TEST_REDIS_URL"), reason="Requires owned PostgreSQL/Redis drill lane"),
]


@pytest.mark.parametrize(
    ("unplanned", "fault"),
    [
        (False, None),
        (True, None),
        (False, "after-key"),
        (False, "after-restore"),
        (False, "after-database-cutover"),
        (False, "after-ready"),
    ],
)
async def test_real_cli_restores_backup_without_reviving_later_token_or_old_password(
    native_context,
    db_session,
    async_engine,
    test_user,
    test_user_employee,
    test_risk,
    tmp_path,
    monkeypatch,
    client_factory,
    unplanned,
    fault,
):
    from jwt import InvalidTokenError

    require_postgres(async_engine)
    root = tmp_path.resolve()
    root.chmod(0o700)
    target_name, validation_name = [f"riskhub_restore_drill_{uuid4().hex}" for _ in range(2)]
    seed_url = make_url(os.environ["TEST_DATABASE_URL"])
    admin_url = seed_url.set(drivername="postgresql", database="postgres").render_as_string(hide_password=False)
    target_url = seed_url.set(database=target_name).render_as_string(hide_password=False)
    validation_url = seed_url.set(database=validation_name).render_as_string(hide_password=False)
    admin = await asyncpg.connect(admin_url)
    redis = Redis.from_url(os.environ["TEST_REDIS_URL"])
    try:
        for name in (target_name, validation_name):
            await admin.execute(f'CREATE DATABASE "{name}"')
        import pyotp

        from app.services._local_auth.keys import LocalKeyring

        binding = await db_session.get(InstallationIdentity, 1)
        installation_id = binding.installation_id
        test_user.local_enrollment_state = "enrolled"
        test_user.local_email_verified_at = utc_now()
        test_user.hashed_password = get_password_hash("Original administrator password 71!")
        keys = LocalKeyring.load(native_context.local_auth_keyring_file)
        factor_key_id, ciphertext = keys.encrypt(
            "totp", pyotp.random_base32(), [installation_id, str(test_user.id), "a" * 32]
        )
        db_session.add(
            LocalAuthFactor(
                user_id=test_user.id,
                generation="a" * 32,
                key_id=factor_key_id,
                encrypted_seed=ciphertext,
                confirmed_at=utc_now(),
                last_time_step=-1,
            )
        )
        admin_id, admin_email = test_user.id, test_user.email
        user = test_user_employee
        user.local_enrollment_state = "enrolled"
        user.local_email_verified_at = utc_now()
        user.hashed_password = get_password_hash("Before backup password 83!")
        user.token_version = 7
        await db_session.commit()
        binding = await db_session.get(InstallationIdentity, 1)
        installation_id = binding.installation_id
        user_id = user.id
        business_id, business_owner = test_risk.id, test_risk.owner_id
        await db_session.commit()
        await dump_database(str(seed_url.render_as_string(hide_password=False)), root / "seed.dump")
        await restore_database(target_url, root / "seed.dump", replace=False)
        key = root / "signing-key"
        key.write_text("isolated real CLI signing authority " * 3)
        key.chmod(0o600)
        app_identity = root / "application.json"
        app_identity.write_text(json.dumps({"source_commit": "a" * 40}))
        app_identity.chmod(0o600)
        validation_file = root / "validation-url"
        validation_file.write_text(validation_url)
        validation_file.chmod(0o600)
        env = os.environ | {
            "DATABASE_URL": target_url,
            "REDIS_URL": os.environ["TEST_REDIS_URL"],
            "DEBUG": "false",
            "MOCK_AUTH_ENABLED": "false",
            "AUTH_MODE": "password",
            "DIRECTORY_PROVIDER": "none",
            "LOCAL_MFA_POLICY": "optional",
            "SECRET_KEY_FILE": str(key),
            "PUBLIC_URL": "https://test",
            "CORS_ORIGINS": '["https://test"]',
            "LOCAL_AUTH_KEYRING_FILE": native_context.local_auth_keyring_file,
            "LOCAL_SMTP_HOST": "localhost",
            "LOCAL_SMTP_SENDER": "security@example.com",
        }
        env.pop("SECRET_KEY", None)
        env.pop("DATABASE_URL_FILE", None)
        settings = native_context.model_copy(
            update={
                "debug": False,
                "database_url": target_url,
                "secret_key_file": str(key),
                "secret_key": key.read_text(),
                "local_mfa_policy": "optional",
                "redis_url": os.environ["TEST_REDIS_URL"],
                "public_url": "https://test",
                "cors_origins": ["https://test"],
            }
        )

        async def cli(*args):
            result = await run_cli("scripts.identity_restore", env, *map(str, args))
            assert result[0] == 0, result
            return json.loads(result[1])

        evidence_key = root / "evidence-key"
        await cli("init-evidence-key", "--output", evidence_key)
        shared = [
            "--dump",
            root / "backup.dump",
            "--manifest",
            root / "backup.json",
            "--evidence-key-file",
            evidence_key,
        ]
        await cli("--maintenance-confirmed", "backup", *shared, "--application-identity", app_identity)
        if not unplanned and fault is None:
            await reject_incompatible_backups(
                root,
                env,
                settings,
                evidence_key,
                installation_id,
                validation_file,
                validation_name,
                admin,
            )
        later = create_access_token({"sub": str(user_id), "token_version": 8}, settings=settings)
        later_refresh, _ = create_refresh_token(user_id=user_id, token_version=8, jti=uuid4().hex, settings=settings)
        async with session_context(settings) as current:
            row = await current.get(User, user_id)
            row.hashed_password = get_password_hash("Replaced since backup password 91!")
            row.token_version = 8
            row.local_suspended, row.local_suspended_at, row.is_active = True, utc_now(), False
            await current.commit()
        owned = f"riskhub:{installation_id}:local-auth:challenge:old"
        unrelated = f"other-application:{uuid4().hex}"
        await redis.set(owned, "obsolete")
        await redis.set(unrelated, "retain")
        operation = root / "operation"
        operation.mkdir(mode=0o700)
        restore_args = [
            "--maintenance-confirmed",
            "restore",
            *shared,
            "--installation-id",
            installation_id,
            "--validation-database-url-file",
            validation_file,
            "--operation-dir",
            operation,
            "--source",
            "real-cli-drill",
        ]
        if unplanned:
            restore_args.append("--unplanned")
        if fault is not None:
            from app.services._identity_restore import operations

            original_restore = operations.restore_database
            original_cutover = operations.reconcile_restored_security
            original_save = operations.save_signed

            async def interrupted_restore(database_url, dump, *, replace):
                if replace and fault == "after-key":
                    raise RuntimeError("injected cutover interruption")
                await original_restore(database_url, dump, replace=replace)
                if replace and fault == "after-restore":
                    raise RuntimeError("injected cutover interruption")

            async def interrupted_cutover(*args, **kwargs):
                result = await original_cutover(*args, **kwargs)
                if fault == "after-database-cutover":
                    raise RuntimeError("injected cutover interruption")
                return result

            def interrupted_save(path, value, key, *, replace=False):
                if replace and fault == "after-ready":
                    raise RuntimeError("injected cutover interruption")
                return original_save(path, value, key, replace=replace)

            with monkeypatch.context() as injection:
                injection.setattr(operations, "restore_database", interrupted_restore)
                injection.setattr(operations, "reconcile_restored_security", interrupted_cutover)
                injection.setattr(operations, "save_signed", interrupted_save)
                with pytest.raises(RuntimeError, match="injected cutover"):
                    await operations.restore(
                        settings,
                        dump=root / "backup.dump",
                        manifest_path=root / "backup.json",
                        evidence_key=evidence_key.read_bytes(),
                        installation_id=installation_id,
                        validation_url=validation_url,
                        migration_config=Path(__file__).resolve().parents[3] / "backend/alembic.ini",
                        operation_dir=operation,
                        source="real-cli-drill",
                        unplanned=False,
                        resume=False,
                    )
            assert (operation / "restore-journal.json").exists()
            assert key.read_text() != settings.secret_key
            result = await cli(*restore_args, "--resume")
        else:
            result = await cli(*restore_args)
        assert result["status"] == "cutover-complete"
        changed_settings = settings.model_copy(update={"secret_key": key.read_text()})
        with pytest.raises(InvalidTokenError):
            decode_access_token(later, settings=changed_settings)
        with pytest.raises(InvalidTokenError):
            decode_refresh_token(later_refresh, changed_settings)
        async with session_context(changed_settings) as restored:
            row = await restored.get(User, user_id)
            assert row.id == user_id and not row.is_active
            if not unplanned:
                assert row.local_suspended
            assert row.hashed_password is None and row.restore_quarantined and row.local_recovery_pending
            assert row.token_version == (8 if unplanned else 9)
            business = await restored.get(Risk, business_id)
            assert business.owner_id == business_owner
        assert await redis.get(owned) is None
        assert await redis.get(unrelated) == b"retain"
        await redis.delete(unrelated)
        assert (await cli("verify-cutover"))["status"] == "verified"
        if unplanned:
            await recover_existing_admin(
                root,
                env,
                changed_settings,
                cli,
                client_factory,
                admin_id=admin_id,
                admin_email=admin_email,
                ordinary_id=user_id,
            )
        for evidence in ["backup.json", "operation/current-security.json", "operation/restore-journal.json"]:
            if unplanned and evidence.endswith("current-security.json"):
                assert not (root / evidence).exists()
                continue
            text = (root / evidence).read_text()
            assert key.read_text() not in text and "password_hash" not in text and "encrypted_seed" not in text
    finally:
        for name in (target_name, validation_name):
            await admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await admin.close()
        await redis.aclose()


async def reject_incompatible_backups(
    root,
    env,
    settings,
    evidence_key,
    installation_id,
    validation_file,
    validation_name,
    admin,
):
    import base64
    import secrets

    from app.services._identity_restore.files import sign_artifact

    original = json.loads((root / "backup.json").read_text())
    changes = [
        {"auth_mode": "microsoft_sso"},
        {"tenant_id": str(uuid4())},
        {"installation_id": str(uuid4())},
        {"schema_revision": "unrecognized-future-schema"},
        {"password_formats": ["obsolete-unknown-hash"]},
        {"restore_contract": 999},
        {"dump_sha256": "f" * 64},
        {"key_ids": {"totp": ["missing-key"], "delivery": [], "action": []}},
    ]
    before_key = (root / "signing-key").read_bytes()
    for index, change in enumerate(changes):
        manifest = root / f"incompatible-{index}.json"
        manifest.write_text(json.dumps(sign_artifact(original["payload"] | change, evidence_key.read_bytes())))
        manifest.chmod(0o600)
        operation = root / f"refused-{index}"
        operation.mkdir(mode=0o700)
        result = await run_cli(
            "scripts.identity_restore",
            env,
            "--maintenance-confirmed",
            "restore",
            "--dump",
            root / "backup.dump",
            "--manifest",
            manifest,
            "--evidence-key-file",
            evidence_key,
            "--installation-id",
            installation_id,
            "--validation-database-url-file",
            validation_file,
            "--operation-dir",
            operation,
            "--source",
            "negative-real-cli-drill",
        )
        assert result[0] == 2, result
        assert not list(operation.iterdir())
        assert (root / "signing-key").read_bytes() == before_key
        assert not Path(str(root / "signing-key") + ".restore-state.json").exists()
    # A matching key identifier with wrong cryptographic bytes passes metadata
    # checks but must fail actual decryption in the separate restored database.
    wrong_keys = json.loads(Path(settings.local_auth_keyring_file).read_text())
    wrong_keys["purposes"]["totp"]["keys"]["v1"] = base64.b64encode(secrets.token_bytes(32)).decode()
    wrong_file = root / "wrong-keyring.json"
    wrong_file.write_text(json.dumps(wrong_keys))
    wrong_file.chmod(0o600)
    result = await run_cli(
        "scripts.identity_restore",
        env | {"LOCAL_AUTH_KEYRING_FILE": str(wrong_file)},
        "--maintenance-confirmed",
        "verify-backup",
        "--dump",
        root / "backup.dump",
        "--manifest",
        root / "backup.json",
        "--evidence-key-file",
        evidence_key,
        "--installation-id",
        installation_id,
        "--validation-database-url-file",
        validation_file,
    )
    assert result[0] != 0
    assert (root / "signing-key").read_bytes() == before_key
    await admin.execute(f'DROP DATABASE "{validation_name}" WITH (FORCE)')
    await admin.execute(f'CREATE DATABASE "{validation_name}"')


async def recover_existing_admin(root, env, settings, cli, client_factory, *, admin_id, admin_email, ordinary_id):
    import base64

    import pyotp
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from tests.backend.pytest.test_local_identity import csrf, login_native

    async def review_file(user_id, filename):
        status = await cli("review-status", "--user-id", user_id)
        for field in ("restore_quarantined", "credential_recovery_pending"):
            status.pop(field)
        status.update(
            reason="Restore incident access reviewed against current records",
            reviewer="Test incident operator",
            incident_reference="INC-restore-drill",
        )
        path = root / filename
        path.write_text(json.dumps(status))
        path.chmod(0o600)
        return path

    ordinary = await review_file(ordinary_id, "ordinary-review.json")
    refused = await run_cli(
        "scripts.identity_restore",
        env,
        "--maintenance-confirmed",
        "reconcile-user",
        "--review-file",
        ordinary,
    )
    assert refused[0] == 2 and "administrator" in refused[2]
    admin_review = await review_file(admin_id, "admin-review.json")
    reviewed = await cli("--maintenance-confirmed", "reconcile-user", "--review-file", admin_review)
    assert not reviewed["active"] and reviewed["credential_recovery_pending"]
    assert (await cli("verify-cutover"))["administrator_recovery_required"]

    trust = {"version": 1, "approvers": []}
    for index in (1, 2):
        key = Ed25519PrivateKey.generate()
        path = root / f"approver-{index}.pem"
        path.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
            )
        )
        path.chmod(0o600)
        trust["approvers"].append(
            {
                "id": f"operator-{index}",
                "name": f"Test approver {index}",
                "public_key": base64.b64encode(key.public_key().public_bytes_raw()).decode(),
            }
        )
    trust_file = root / "approvers.json"
    trust_file.write_text(json.dumps(trust))
    trust_file.chmod(0o600)
    recovery_env = env | {"LOCAL_RECOVERY_APPROVERS_FILE": str(trust_file)}

    async def recovery(*args):
        result = await run_cli("scripts.local_recovery", recovery_env, *args)
        assert result[0] == 0, result
        return result

    envelope = root / "recovery-envelope.json"
    await recovery(
        "prepare",
        "--maintenance-confirmed",
        "--target-user-id",
        admin_id,
        "--operation",
        "credential_and_factor_recovery",
        "--incident",
        "INC-restore-drill",
        "--verification",
        "in-person",
        "--reason",
        "Restore without current security checkpoint",
        "--output",
        envelope,
    )
    for index in (1, 2):
        await recovery(
            "sign",
            "--envelope",
            envelope,
            "--private-key-file",
            root / f"approver-{index}.pem",
            "--signer-id",
            f"operator-{index}",
            "--output",
            root / f"approval-{index}.json",
        )
    args = ["--maintenance-confirmed", "--envelope", envelope, "--approval", root / "approval-1.json"]
    single = await run_cli("scripts.local_recovery", recovery_env, "verify", *args)
    assert single[0] == 2
    args += ["--approval", root / "approval-2.json"]
    await recovery("verify", *args)
    grant_file = root / "new-recovery-grant.json"
    result = await recovery("recover", *args, "--output", grant_file)
    grant = json.loads(grant_file.read_text())["grant"]
    assert grant not in result[1] + result[2]

    # Public recovery contracts run against the actual restored DB. The debug
    # origin is only the existing in-process test harness; release admission stays
    # closed until #208's separate non-debug Docker acceptance candidate.
    http_settings = settings.model_copy(
        update={
            "debug": True,
            "public_url": "http://test",
            "cors_origins": ["http://test"],
            "local_mfa_policy": "required",
        }
    )

    async def restored_db():
        async with session_context(http_settings) as db:
            yield db

    async with client_factory(
        settings=http_settings, db_override=restored_db, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        password = "New post restore administrator passphrase 76!"
        start = await client.post("/api/v1/auth/local/recovery/start", json={"grant": grant, "new_password": password})
        assert start.status_code == 200, start.text
        complete = await client.post(
            "/api/v1/auth/local/recovery/confirm",
            json={
                "challenge": start.json()["challenge"],
                "code": pyotp.parse_uri(start.json()["provisioning_uri"]).now(),
            },
        )
        assert complete.status_code == 200, complete.text
        await login_native(client, admin_email, password, complete.json()["recovery_codes"][0])
    assert not (await cli("verify-cutover"))["administrator_recovery_required"]
    # The recovered administrator does not implicitly release other users.
    ordinary = await review_file(ordinary_id, "ordinary-current-review.json")
    reviewed = await cli("--maintenance-confirmed", "reconcile-user", "--review-file", ordinary)
    assert not reviewed["active"] and reviewed["credential_recovery_pending"]
    replay = await run_cli(
        "scripts.identity_restore", env, "--maintenance-confirmed", "reconcile-user", "--review-file", ordinary
    )
    assert replay[0] == 2
