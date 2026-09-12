"""Installed-state checks reject incompatible releases without mutating authority."""

import json
import os
from pathlib import Path

import pytest
from sqlalchemy import select, text

from app.models import LocalAuthFactor, User
from app.services._local_auth.bootstrap import bootstrap_native
from tests.backend.pytest import test_local_bootstrap as bootstrap_support
from tests.backend.pytest.test_identity_foundations_postgres import require_postgres
from tests.backend.pytest.test_local_recovery import cli_environment, run_cli

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.postgres,
    pytest.mark.skipif(
        not os.environ.get("TEST_REDIS_URL"),
        reason="Native CLI integration requires TEST_REDIS_URL; covered by the native PostgreSQL/Redis CI lane",
    ),
]
ALEMBIC_CONFIG = Path(__file__).resolve().parents[3] / "backend" / "alembic.ini"
bootstrap_context = bootstrap_support.bootstrap_context
bootstrap_request = bootstrap_support.bootstrap_request


@pytest.mark.parametrize("policy", ["required", "optional"])
async def test_diagnostics_separate_delivery_pending_enrollment_and_security(
    bootstrap_context,
    bootstrap_request,
    db_session,
    async_engine,
    monkeypatch,
    policy,
):
    from app.services import identity_diagnostics

    require_postgres(async_engine)
    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    settings = bootstrap_context.settings.model_copy(
        update={
            "debug": False,
            "local_mfa_policy": policy,
            "public_url": "https://test",
            "cors_origins": ["https://test"],
        }
    )
    before = list(
        await db_session.execute(
            select(User.id, User.token_version, User.hashed_password)
        )
    )

    def mail_failure(_settings):
        raise OSError("private server response must not be exposed")

    monkeypatch.setattr(identity_diagnostics, "probe_mail", mail_failure)
    result = await identity_diagnostics.inspect_runtime(
        db_session,
        settings,
        bootstrap_context.limiter.redis,
        check_mail=True,
    )
    assert result["security"] == "available" and result["delivery"] == "degraded"
    assert result["onboarding"] == "admin-enrollment-pending"
    assert (
        result["external_directory"] == "not_applicable"
        and result["local_mfa_policy"] == policy
    )
    assert result["release_admission"] == "awaiting_208"
    assert "private" not in json.dumps(result) and "grant_id" not in json.dumps(result)
    settings.local_auth_keyring_file = "/missing/security/keyring"
    unavailable = await identity_diagnostics.inspect_runtime(
        db_session, settings, bootstrap_context.limiter.redis
    )
    assert (
        unavailable["security"] == "unavailable"
        and unavailable["delivery"] == "unchecked"
    )
    assert (
        list(
            await db_session.execute(
                select(User.id, User.token_version, User.hashed_password)
            )
        )
        == before
    )


async def test_managed_bootstrap_resumes_explicitly_reissued_handoff(
    bootstrap_context,
    bootstrap_request,
    db_session,
    async_engine,
    tmp_path,
):
    from app.models import LocalBootstrapTarget
    from app.services._local_auth.bootstrap import reissue_bootstrap

    require_postgres(async_engine)
    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    new_path = str(Path(bootstrap_request.admin_file).with_name("reissued-admin.json"))
    await reissue_bootstrap(
        db_session,
        bootstrap_context,
        slot="admin",
        output=new_path,
        reason="test installer resume",
    )
    before = Path(new_path).read_bytes()
    env = cli_environment(
        bootstrap_context.settings,
        bootstrap_context.settings.local_recovery_approvers_file,
    )
    result = await run_cli(
        "scripts.bootstrap_local_users",
        env,
        "--maintenance-confirmed",
        "install",
        "--admin-email",
        bootstrap_request.admin_email,
        "--cro-email",
        bootstrap_request.cro_email,
        "--handoff-dir",
        str(tmp_path / "unneeded-default"),
    )
    assert result[0] == 0, result
    assert Path(new_path).read_bytes() == before
    assert len((await db_session.scalars(select(User))).all()) == 2
    target = await db_session.scalar(
        select(LocalBootstrapTarget).where(LocalBootstrapTarget.slot == "admin")
    )
    assert target.handoff_path == new_path


@pytest.mark.parametrize("policy", ["required", "optional"])
async def test_identity_preflight_preserves_pending_native_installation(
    bootstrap_context,
    bootstrap_request,
    db_session,
    async_engine,
    policy,
):
    require_postgres(async_engine)
    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    before = list(
        await db_session.execute(
            select(User.id, User.token_version, User.hashed_password, User.is_active)
        )
    )
    env = cli_environment(
        bootstrap_context.settings,
        bootstrap_context.settings.local_recovery_approvers_file,
    )
    env["LOCAL_MFA_POLICY"] = policy
    result = await run_cli(
        "scripts.identity_preflight", env, "--alembic-config", str(ALEMBIC_CONFIG)
    )
    assert result[0] == 0, result
    assert json.loads(result[1])["status"] == "compatible"
    assert json.loads(result[1])["mutated"] is False
    assert (
        list(
            await db_session.execute(
                select(
                    User.id, User.token_version, User.hashed_password, User.is_active
                )
            )
        )
        == before
    )


@pytest.mark.parametrize("mutation", ["contract", "hash", "keys", "schema"])
async def test_identity_preflight_refuses_unknown_security_state_before_writers_stop(
    bootstrap_context,
    bootstrap_request,
    db_session,
    async_engine,
    mutation,
    monkeypatch,
):
    require_postgres(async_engine)
    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    user = await db_session.scalar(select(User).order_by(User.id))
    current_revision = await db_session.scalar(
        text("SELECT version_num FROM alembic_version")
    )
    if mutation == "contract":
        from app.services.identity_installation import IdentityBindingError
        from scripts.identity_preflight import inspect_identity

        # Simulate a candidate reader that cannot support the installed version;
        # the current DB constraint forbids storing arbitrary future versions.
        monkeypatch.setattr(
            "app.services.identity_installation.IDENTITY_CONTRACT_VERSION", 999
        )
        settings = bootstrap_context.settings.model_copy(update={"debug": False})
        with pytest.raises(IdentityBindingError, match="contract_version"):
            await inspect_identity(
                db_session, settings, migration_config=ALEMBIC_CONFIG
            )
        return
    elif mutation == "hash":
        user.hashed_password = "$futurehash$v=999$unsupported"
    elif mutation == "keys":
        key_id, encrypted = bootstrap_context.keys.encrypt(
            "totp",
            "TESTSEED",
            [bootstrap_context.installation_id, str(user.id), "generation"],
        )
        db_session.add(
            LocalAuthFactor(
                user_id=user.id,
                generation="generation",
                key_id=key_id,
                encrypted_seed=encrypted,
            )
        )
        key_file = Path(bootstrap_context.settings.local_auth_keyring_file)
        payload = json.loads(key_file.read_text())
        payload["purposes"]["totp"]["keys"]["v1"] = payload["purposes"]["action"][
            "keys"
        ]["v1"]
        # Retain format validity and unique keys while changing the encryption material.
        import base64

        payload["purposes"]["action"]["keys"]["v1"] = base64.b64encode(
            b"x" * 32
        ).decode()
        key_file.write_text(json.dumps(payload))
    else:
        await db_session.execute(
            text("UPDATE alembic_version SET version_num = 'unknown_release'")
        )
    await db_session.commit()
    try:
        env = cli_environment(
            bootstrap_context.settings,
            bootstrap_context.settings.local_recovery_approvers_file,
        )
        result = await run_cli(
            "scripts.identity_preflight", env, "--alembic-config", str(ALEMBIC_CONFIG)
        )
        assert result[0] in {2, 3}, result
        assert "refused" in result[2] or "unavailable" in result[2]
        await db_session.refresh(user)
        assert not user.is_active and user.token_version == 0
        assert "TESTSEED" not in result[1] + result[2]
    finally:
        if mutation == "schema":
            await db_session.execute(
                text("UPDATE alembic_version SET version_num = :revision"),
                {"revision": current_revision},
            )
            await db_session.commit()
