"""Native bootstrap persists principals and crash-safe restricted handoff state."""

import base64
import json

import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import select

from app.models import User


@pytest.fixture
def bootstrap_request(tmp_path):
    from app.services._local_auth.bootstrap import BootstrapRequest

    directory = tmp_path / "handoff"
    directory.mkdir(mode=0o700)
    return BootstrapRequest(
        "admin@example.com",
        "cro@example.com",
        str(directory / "admin.json"),
        str(directory / "cro.json"),
    )


@pytest_asyncio.fixture
async def bootstrap_context(native_context, db_session, tmp_path):
    from app.main import app
    from app.services._local_auth.common import build_context

    trust = tmp_path / "approvers.json"
    trust.write_text(
        json.dumps(
            {
                "version": 1,
                "approvers": [
                    {
                        "id": str(i),
                        "name": f"Operator {i}",
                        "public_key": base64.b64encode(
                            Ed25519PrivateKey.generate().public_key().public_bytes_raw()
                        ).decode(),
                    }
                    for i in (1, 2)
                ],
            }
        )
    )
    trust.chmod(0o600)
    native_context.local_recovery_approvers_file = str(trust)
    return await build_context(
        db_session,
        settings=native_context,
        redis=app.state.redis,
        source="bootstrap-test",
    )


@pytest.mark.asyncio
async def test_fresh_native_bootstrap_creates_only_pending_admin_and_cro(
    bootstrap_context, db_session, tmp_path
):
    from app.models import LocalBootstrapTarget
    from app.services._local_auth.bootstrap import BootstrapRequest, bootstrap_native

    directory = tmp_path / "handoff"
    directory.mkdir(mode=0o700)
    request = BootstrapRequest(
        "ADMIN@example.com",
        "cro@example.com",
        str(directory / "admin.json"),
        str(directory / "cro.json"),
    )
    result = await bootstrap_native(db_session, bootstrap_context, request)
    assert result["status"] == "admin-enrollment-pending"
    users = (await db_session.scalars(select(User).order_by(User.id))).all()
    assert [user.email for user in users] == ["admin@example.com", "cro@example.com"]
    assert all(
        not user.is_active and user.hashed_password is None and user.external_id is None
        for user in users
    )
    assert all(
        user.local_enrollment_state == "invited" and user.access_scope == "global"
        for user in users
    )
    targets = (await db_session.scalars(select(LocalBootstrapTarget))).all()
    assert len(targets) == 2 and all(target.completed_at is None for target in targets)
    for path in directory.iterdir():
        assert path.stat().st_mode & 0o777 == 0o600
        payload = json.loads(path.read_text())
        assert payload["credential"] not in json.dumps(result)
        assert payload["installation_id"] == bootstrap_context.installation_id


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
async def test_completed_targets_cannot_be_reset_or_restored(
    bootstrap_context, bootstrap_request, db_session, client_factory, policy, tmp_path
):
    from pathlib import Path

    from app.core.exceptions import ConflictError
    from app.models import LocalBootstrapTarget, Role
    from app.services._local_auth.bootstrap import (
        bootstrap_native,
        bootstrap_status,
        reissue_bootstrap,
    )
    from tests.backend.pytest.test_local_identity import (
        PASSWORD,
        csrf,
        enroll,
        login_native,
        login_password_only,
    )

    ctx = bootstrap_context
    ctx.settings.local_mfa_policy = policy
    await bootstrap_native(db_session, ctx, bootstrap_request)
    initial = json.loads(Path(bootstrap_request.admin_file).read_text())
    async with client_factory(
        settings=ctx.settings, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        denied = await client.post("/api/v1/auth/refresh")
        assert denied.status_code in {401, 403}
        await csrf(client)
        if policy == "required":
            codes, _ = await enroll(client, initial["credential"])
            await login_native(
                client, bootstrap_request.admin_email, PASSWORD, codes[0]
            )
        else:
            result = await client.post(
                "/api/v1/auth/local/enrollment/start",
                json={"grant": initial["credential"], "password": PASSWORD},
            )
            assert (
                result.status_code == 202 and result.json()["status"] == "completed"
            ), result.text
            assert client.cookies.get("riskhub_refresh_token") is None
            await login_password_only(client, bootstrap_request.admin_email, PASSWORD)
        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200 and me.json()["id"] == initial["user_id"]
    status = await bootstrap_status(db_session, ctx)
    assert status["status"] == "cro-enrollment-pending" and status["operational_admin"]
    admin = await db_session.get(User, initial["user_id"], populate_existing=True)
    encoded = admin.hashed_password
    admin.role_id = await db_session.scalar(
        select(Role.id).where(Role.name == "employee")
    )
    admin.local_suspended, admin.is_active = True, False
    await db_session.commit()
    result = await bootstrap_native(db_session, ctx, bootstrap_request)
    assert (
        result["status"] == "cro-enrollment-pending" and not result["operational_admin"]
    )
    await db_session.refresh(admin)
    assert (
        admin.local_suspended
        and not admin.is_active
        and admin.hashed_password == encoded
    )
    completed = await db_session.get(
        LocalBootstrapTarget, (ctx.installation_id, "admin")
    )
    assert completed.completed_at is not None
    with pytest.raises(ConflictError):
        await reissue_bootstrap(
            db_session,
            ctx,
            slot="admin",
            output=str(tmp_path / "handoff" / "new.json"),
            reason="Not recovery",
        )
    async with client_factory(
        settings=ctx.settings, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        replay = await client.post(
            "/api/v1/auth/local/enrollment/start",
            json={"grant": initial["credential"], "password": PASSWORD},
        )
        assert replay.status_code == 401


@pytest.mark.asyncio
async def test_failed_handoff_resumes_same_committed_grant(
    bootstrap_context, bootstrap_request, db_session, monkeypatch
):
    from pathlib import Path

    from app.models import LocalAuthDelivery, LocalAuthGrant
    from app.services._local_auth import bootstrap

    original = bootstrap.publish_handoff

    def fail_cro(path, payload):
        if path == bootstrap_request.cro_file:
            raise OSError("Simulated unavailable volume")
        original(path, payload)

    monkeypatch.setattr(bootstrap, "publish_handoff", fail_cro)
    result = await bootstrap.bootstrap_native(
        db_session, bootstrap_context, bootstrap_request
    )
    assert result["status"] == "handoff-failed" and result["failed_handoffs"] == ["cro"]
    cro = next(target for target in result["targets"] if target["slot"] == "cro")
    envelope = await db_session.get(LocalAuthDelivery, cro["delivery_id"])
    assert envelope.ciphertext and not Path(bootstrap_request.cro_file).exists()
    monkeypatch.setattr(bootstrap, "publish_handoff", original)
    resumed = await bootstrap.bootstrap_native(
        db_session, bootstrap_context, bootstrap_request
    )
    assert resumed["status"] == "admin-enrollment-pending"
    payload = json.loads(Path(bootstrap_request.cro_file).read_text())
    assert payload["grant_id"] == cro["grant_id"]
    assert len((await db_session.scalars(select(User))).all()) == 2
    grants = (await db_session.scalars(select(LocalAuthGrant))).all()
    assert len(grants) == 2 and all(
        grant.secret_hash != payload["credential"] for grant in grants
    )


@pytest.mark.asyncio
async def test_file_publication_before_db_acknowledgement_resumes(
    bootstrap_context, bootstrap_request, db_session, monkeypatch
):
    from pathlib import Path

    from app.services._local_auth import bootstrap

    original = bootstrap.commit_local

    async def fail_handoff(db, boundary):
        if boundary == "bootstrap_handoff":
            raise RuntimeError("Simulated process loss before handoff acknowledgement")
        await original(db, boundary)

    monkeypatch.setattr(bootstrap, "commit_local", fail_handoff)
    with pytest.raises(RuntimeError):
        await bootstrap.bootstrap_native(
            db_session, bootstrap_context, bootstrap_request
        )
    credential = Path(bootstrap_request.admin_file).read_bytes()
    monkeypatch.setattr(bootstrap, "commit_local", original)
    result = await bootstrap.bootstrap_native(
        db_session, bootstrap_context, bootstrap_request
    )
    assert result["status"] == "admin-enrollment-pending"
    assert Path(bootstrap_request.admin_file).read_bytes() == credential


@pytest.mark.asyncio
async def test_pending_reissue_is_explicit_and_revokes_old_grant(
    bootstrap_context, bootstrap_request, db_session, tmp_path
):
    from pathlib import Path

    from app.models import LocalAuthGrant
    from app.services._local_auth.bootstrap import bootstrap_native, reissue_bootstrap

    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    old = json.loads(Path(bootstrap_request.cro_file).read_text())
    path = tmp_path / "handoff" / "cro-reissued.json"
    result = await reissue_bootstrap(
        db_session,
        bootstrap_context,
        slot="cro",
        output=str(path),
        reason="Lost sealed handoff INC-203",
    )
    assert result["status"] == "admin-enrollment-pending"
    new = json.loads(path.read_text())
    assert old["credential"] != new["credential"] and old["user_id"] == new["user_id"]
    grant = await db_session.get(
        LocalAuthGrant, old["grant_id"], populate_existing=True
    )
    assert grant.revoked_at is not None


@pytest.mark.asyncio
async def test_dry_run_validates_without_seeding_or_file_writes(
    bootstrap_context, bootstrap_request, db_session
):
    from pathlib import Path

    from app.models import Role
    from app.services._local_auth.bootstrap import bootstrap_native

    result = await bootstrap_native(
        db_session, bootstrap_context, bootstrap_request, dry_run=True
    )
    assert result["status"] == "validated-not-written"
    assert not Path(bootstrap_request.admin_file).exists()
    assert not (await db_session.scalars(select(User))).all()
    assert not (await db_session.scalars(select(Role))).all()


@pytest.mark.parametrize(
    "kind",
    [
        "symlink-file",
        "symlink-directory",
        "traversal",
        "unrelated",
        "world-readable",
        "unsafe-directory",
    ],
)
def test_handoff_rejects_unsafe_destinations(tmp_path, kind):
    from app.services._local_auth.bootstrap_files import (
        BootstrapFileError,
        validate_destination,
    )

    directory = tmp_path / "private"
    directory.mkdir(mode=0o700)
    path = directory / "secret.json"
    if kind == "symlink-file":
        path.symlink_to(directory / "elsewhere")
    elif kind == "symlink-directory":
        alias = tmp_path / "alias"
        alias.symlink_to(directory, target_is_directory=True)
        path = alias / "secret.json"
    elif kind == "traversal":
        path = directory / ".." / "private" / "secret.json"
    elif kind in {"unrelated", "world-readable"}:
        path.write_text('{"unrelated": true}')
        path.chmod(0o644 if kind == "world-readable" else 0o600)
    else:
        directory.chmod(0o755)
    with pytest.raises(BootstrapFileError):
        validate_destination(str(path))


@pytest.mark.asyncio
@pytest.mark.parametrize("conflicting", [False, True])
async def test_concurrent_real_cli_bootstrap_is_idempotent_or_rejects_conflict(
    bootstrap_context, bootstrap_request, db_session, async_engine, conflicting
):
    import asyncio
    from pathlib import Path

    from tests.backend.pytest.test_identity_foundations_postgres import require_postgres
    from tests.backend.pytest.test_local_recovery import cli_environment, run_cli

    require_postgres(async_engine)
    args = [
        "--maintenance-confirmed",
        "start",
        "--admin-email",
        bootstrap_request.admin_email,
        "--cro-email",
        bootstrap_request.cro_email,
        "--admin-file",
        bootstrap_request.admin_file,
        "--cro-file",
        bootstrap_request.cro_file,
    ]
    other = args.copy()
    if conflicting:
        other[5] = "conflicting@example.com"
    env = cli_environment(
        bootstrap_context.settings,
        bootstrap_context.settings.local_recovery_approvers_file,
    )
    first, second = await asyncio.gather(
        run_cli("scripts.bootstrap_local_users", env, *args),
        run_cli("scripts.bootstrap_local_users", env, *other),
    )
    assert sorted([first[0], second[0]]) == ([0, 2] if conflicting else [0, 0]), (
        first,
        second,
    )
    assert len((await db_session.scalars(select(User))).all()) == 2
    for filepath in (bootstrap_request.admin_file, bootstrap_request.cro_file):
        payload = json.loads(Path(filepath).read_text())
        assert all(
            payload["credential"] not in result[1] + result[2]
            for result in (first, second)
        )
    completed = await run_cli("scripts.bootstrap_local_users", env, "status")
    assert completed[0] == 0, completed
    assert json.loads(completed[1])["status"] == "admin-enrollment-pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("after_commit", [False, True])
async def test_principal_commit_interruption_never_creates_duplicate_accounts(
    bootstrap_context, bootstrap_request, db_session, monkeypatch, after_commit
):
    from pathlib import Path

    from app.services._local_auth import bootstrap

    original = bootstrap.commit_local

    async def interrupted(db, boundary):
        if boundary == "bootstrap_principals":
            if after_commit:
                await original(db, boundary)
            raise RuntimeError("Simulated process loss at principal commit")
        await original(db, boundary)

    monkeypatch.setattr(bootstrap, "commit_local", interrupted)
    with pytest.raises(RuntimeError):
        await bootstrap.bootstrap_native(
            db_session, bootstrap_context, bootstrap_request
        )
    users = (await db_session.scalars(select(User))).all()
    assert len(users) == (2 if after_commit else 0)
    assert not Path(bootstrap_request.admin_file).exists()
    monkeypatch.setattr(bootstrap, "commit_local", original)
    result = await bootstrap.bootstrap_native(
        db_session, bootstrap_context, bootstrap_request
    )
    assert result["status"] == "admin-enrollment-pending"
    assert len((await db_session.scalars(select(User))).all()) == 2


@pytest.mark.asyncio
async def test_password_set_without_factor_can_resume_but_never_reissue(
    bootstrap_context, bootstrap_request, db_session, client_factory, tmp_path
):
    from pathlib import Path

    import pyotp

    from app.core.exceptions import ConflictError
    from app.services._local_auth.bootstrap import (
        bootstrap_native,
        bootstrap_status,
        reissue_bootstrap,
    )
    from tests.backend.pytest.test_local_identity import PASSWORD, csrf

    ctx = bootstrap_context
    await bootstrap_native(db_session, ctx, bootstrap_request)
    initial = json.loads(Path(bootstrap_request.admin_file).read_text())
    async with client_factory(
        settings=ctx.settings, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        response = await client.post(
            "/api/v1/auth/local/enrollment/start",
            json={"grant": initial["credential"], "password": PASSWORD},
        )
        assert (
            response.status_code == 202
            and client.cookies.get("riskhub_refresh_token") is None
        )
        assert (await client.get("/api/v1/auth/me")).status_code == 401
    snapshot = await bootstrap_native(db_session, ctx, bootstrap_request)
    assert (
        snapshot["status"] == "admin-enrollment-pending"
        and not snapshot["operational_admin"]
    )
    with pytest.raises(ConflictError):
        await reissue_bootstrap(
            db_session,
            ctx,
            slot="admin",
            output=str(tmp_path / "handoff" / "new.json"),
            reason="Interrupted setup",
        )
    async with client_factory(
        settings=ctx.settings, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": bootstrap_request.admin_email, "password": PASSWORD},
        )
        assert (
            login.status_code == 202 and login.json()["status"] == "enrollment_required"
        )
        setup = await client.post(
            "/api/v1/auth/local/mfa/setup",
            json={"challenge": login.json()["challenge"]},
        )
        assert setup.status_code == 200, setup.text
        confirm = await client.post(
            "/api/v1/auth/local/mfa/confirm",
            json={
                "challenge": setup.json()["challenge"],
                "code": pyotp.parse_uri(setup.json()["provisioning_uri"]).now(),
            },
        )
        assert confirm.status_code == 200, confirm.text
    assert (await bootstrap_status(db_session, ctx))[
        "status"
    ] == "cro-enrollment-pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("replace_file", [False, True])
async def test_abort_revokes_before_removing_only_verified_handoffs(
    bootstrap_context, bootstrap_request, db_session, replace_file
):
    from pathlib import Path

    from app.models import LocalAuthGrant
    from app.services._local_auth.bootstrap import (
        abort_pending_bootstrap,
        bootstrap_native,
    )

    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    cro_file = Path(bootstrap_request.cro_file)
    if replace_file:
        cro_file.write_text('{"unrelated": true}')
    result = await abort_pending_bootstrap(
        db_session, bootstrap_context, reason="CHG-203 cancelled installation"
    )
    assert result["status"] == "aborted"
    assert result["cleanup_failed"] == (["cro"] if replace_file else [])
    assert not Path(bootstrap_request.admin_file).exists()
    assert cro_file.exists() is replace_file
    assert len((await db_session.scalars(select(User))).all()) == 2
    grants = (await db_session.scalars(select(LocalAuthGrant))).all()
    assert len(grants) == 2 and all(grant.revoked_at is not None for grant in grants)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid",
    ["same-email", "invalid-email", "same-file", "missing-approvers", "wrong-profile"],
)
async def test_invalid_bootstrap_prerequisites_do_not_seed_or_create_accounts(
    bootstrap_context, bootstrap_request, db_session, invalid
):
    from dataclasses import replace

    from app.core.exceptions import DomainError
    from app.models import Role
    from app.services._local_auth.bootstrap import bootstrap_native

    request = bootstrap_request
    if invalid == "same-email":
        request = replace(request, cro_email=" ADMIN@EXAMPLE.COM ")
    elif invalid == "invalid-email":
        request = replace(request, admin_email="invalid")
    elif invalid == "same-file":
        request = replace(request, cro_file=request.admin_file)
    elif invalid == "missing-approvers":
        bootstrap_context.settings.local_recovery_approvers_file = None
    else:
        bootstrap_context.settings.auth_mode = "microsoft_sso"
        bootstrap_context.settings.directory_provider = "graph"
    with pytest.raises(DomainError):
        await bootstrap_native(db_session, bootstrap_context, request)
    assert not (await db_session.scalars(select(User))).all()
    assert not (await db_session.scalars(select(Role))).all()


@pytest.mark.asyncio
async def test_unknown_existing_user_is_never_adopted_or_elevated(
    bootstrap_context, bootstrap_request, db_session, test_user_employee
):
    from app.core.exceptions import ConflictError
    from app.services._local_auth.bootstrap import bootstrap_native

    test_user_employee.email = bootstrap_request.admin_email
    await db_session.commit()
    user_id, role_id = test_user_employee.id, test_user_employee.role_id
    with pytest.raises(ConflictError):
        await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    existing = await db_session.get(User, user_id, populate_existing=True)
    assert existing.role_id == role_id
    assert len((await db_session.scalars(select(User))).all()) == 1


@pytest.mark.asyncio
async def test_expired_grant_reports_unusable_handoff_and_requires_explicit_reissue(
    bootstrap_context, bootstrap_request, db_session, tmp_path
):
    from datetime import timedelta
    from pathlib import Path

    from app.core.datetime_utils import utc_now
    from app.models import LocalAuthGrant
    from app.services._local_auth.bootstrap import (
        bootstrap_native,
        bootstrap_status,
        reissue_bootstrap,
    )

    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    old = json.loads(Path(bootstrap_request.cro_file).read_text())
    grant = await db_session.get(LocalAuthGrant, old["grant_id"])
    grant.expires_at = utc_now() - timedelta(seconds=1)
    await db_session.commit()
    status = await bootstrap_status(db_session, bootstrap_context)
    assert status["status"] == "handoff-failed" and status["failed_handoffs"] == ["cro"]
    await bootstrap_native(db_session, bootstrap_context, bootstrap_request)
    assert (
        json.loads(Path(bootstrap_request.cro_file).read_text())["credential"]
        == old["credential"]
    )
    result = await reissue_bootstrap(
        db_session,
        bootstrap_context,
        slot="cro",
        output=str(tmp_path / "handoff" / "fresh-cro.json"),
        reason="Expired sealed handoff",
    )
    assert result["status"] == "admin-enrollment-pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
async def test_both_initial_recipients_complete_their_own_accounts(
    bootstrap_context, bootstrap_request, db_session, client_factory, policy
):
    from pathlib import Path

    from app.services._local_auth.bootstrap import bootstrap_native, bootstrap_status
    from tests.backend.pytest.test_local_identity import PASSWORD, csrf, enroll

    ctx = bootstrap_context
    ctx.settings.local_mfa_policy = policy
    await bootstrap_native(db_session, ctx, bootstrap_request)
    for path in (bootstrap_request.admin_file, bootstrap_request.cro_file):
        invitation = json.loads(Path(path).read_text())
        async with client_factory(
            settings=ctx.settings, headers={"Origin": "http://test"}
        ) as client:
            if policy == "required":
                await enroll(client, invitation["credential"])
            else:
                await csrf(client)
                result = await client.post(
                    "/api/v1/auth/local/enrollment/start",
                    json={"grant": invitation["credential"], "password": PASSWORD},
                )
                assert (
                    result.status_code == 202 and result.json()["status"] == "completed"
                )
    status = await bootstrap_status(db_session, ctx)
    assert status["status"] == "completed" and status["operational_admin"]
    assert all(entry["enrollment"] == "completed" for entry in status["targets"])
    assert (await bootstrap_native(db_session, ctx, bootstrap_request)) == status
