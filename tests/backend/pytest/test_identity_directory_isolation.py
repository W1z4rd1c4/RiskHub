"""Native runtime never composes an external identity client or directory job."""

from unittest.mock import Mock

import pytest

from app.core import scheduler_jobs
from app.core.config import Settings
from app.core.exceptions import AuthorizationError
from app.services._graph_directory.auth import GraphAccessTokenProvider
from app.services._graph_directory.service import GraphDirectoryService
from app.services.directory_provider_service import DirectoryProviderService
from app.services.sso_token_service import EntraTokenVerifier, get_entra_verifier


def native_settings():
    return Settings(
        _env_file=None,
        debug=True,
        mock_auth_enabled=False,
        auth_mode="password",
        directory_provider="none",
    )


@pytest.mark.parametrize(
    "factory",
    [
        DirectoryProviderService,
        GraphDirectoryService,
        GraphAccessTokenProvider,
        get_entra_verifier,
        lambda settings: EntraTokenVerifier(settings=settings),
    ],
)
def test_native_rejects_external_client_construction(factory):
    with pytest.raises(AuthorizationError):
        factory(native_settings())


def test_native_scheduler_keeps_business_and_outbox_jobs(monkeypatch):
    scheduler = Mock()
    monkeypatch.setattr(scheduler_jobs, "scheduler", scheduler)
    registered = scheduler_jobs.register_full_scheduler_jobs(native_settings())
    assert set(registered) == {
        "kri_deadline_check",
        "questionnaire_deadline_check",
        "issue_deadline_check",
        "orphan_scan",
        "outbox_dispatch",
    }
    assert {call.kwargs["id"] for call in scheduler.add_job.call_args_list} == set(registered)


@pytest.mark.asyncio
async def test_native_denied_routes_and_diagnostics_have_no_external_effects(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
    monkeypatch,
):
    import httpx
    from sqlalchemy import select

    from app.core.datetime_utils import utc_now
    from app.models import InstallationIdentity, User
    from app.services import directory_provider_service
    from app.services.ad_deprovision_service import ADDeprovisionService
    from tests.backend.pytest.test_local_identity import csrf

    calls = []
    original_send = httpx.AsyncClient.send

    async def observed_send(client, request, *args, **kwargs):
        if request.url.host != "test":
            calls.append(str(request.url))
            raise AssertionError("Unexpected external HTTP attempt")
        return await original_send(client, request, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "send", observed_send)
    constructor = Mock(side_effect=AssertionError("External provider constructed"))
    monkeypatch.setattr(directory_provider_service, "GraphDirectoryService", constructor)
    monkeypatch.setattr(directory_provider_service, "_ADEmulatorDirectoryService", constructor)
    test_user.local_enrollment_state = "enrolled"
    test_user.local_email_verified_at = utc_now()
    await db_session.commit()
    version = test_user_employee.token_version
    async with client_factory(
        current_user=test_user, settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        for method, path, body in [
            ("GET", "/api/v1/directory/users/search?q=example", None),
            ("GET", "/api/v1/directory/users/some-external-id", None),
            ("POST", "/api/v1/directory/users/some-external-id/import", {}),
            ("POST", f"/api/v1/admin/directory/check-user/{test_user_employee.id}", None),
            ("POST", "/api/v1/admin/directory/check-all", None),
            (
                "POST",
                f"/api/v1/admin/directory/break-glass-enable/{test_user_employee.id}",
                {"reason": "INC-disabled", "expires_in_hours": 1},
            ),
        ]:
            result = await client.request(method, path, json=body)
            assert result.status_code == 403, (path, result.text)
            assert result.json()["detail"]["code"] == "DIRECTORY_DISABLED"
        for path, body in [
            ("/api/v1/auth/sso/start", {}),
            ("/api/v1/auth/sso/exchange", {"id_token": "invalid", "state": "invalid"}),
        ]:
            assert (await client.post(path, json=body)).status_code == 403
        config = (await client.get("/api/v1/auth/config")).json()
        assert config["identity"] == {
            "mode": "native",
            "external_directory": "disabled",
            "local_enrollment_enabled": True,
            "password_reset_enabled": True,
            "factor_management_enabled": True,
            "recovery_method": "governed_local",
        }
        assert (
            config["sso"]["authority"] is None
            and config["sso"]["tenant_id"] is None
            and config["sso"]["client_id"] is None
        )
        assert config["sso_error"] is None
        public = (await client.get("/api/v1/health")).json()
        assert public["external_directory"] == "not_applicable" and "identity_binding" not in public
        operator = (await client.get("/api/v1/admin/health")).json()
        binding = await db_session.scalar(select(InstallationIdentity))
        assert operator["identity_binding"]["installation_id"] == binding.installation_id
        assert operator["external_directory"] == "not_applicable"
        caps = (await client.get("/api/v1/auth/me/capabilities")).json()["identity"]
        assert caps == {
            "can_invite_users": True,
            "can_manage_own_credentials": True,
            "can_import_directory_users": False,
            "can_check_directory_users": False,
        }
        assert not (await client.get("/api/v1/admin/capabilities")).json()["can_run_directory_check_all"]
        for path in ["/api/v1/users/directory", "/api/v1/users/lookup", "/api/v1/access/users"]:
            result = await client.get(path)
            assert result.status_code == 200, (path, result.text)
    for operation in [
        ADDeprovisionService.check_user_by_id(db_session, settings=native_context, user_id=test_user_employee.id),
        ADDeprovisionService.check_all_users(db_session, settings=native_context),
        ADDeprovisionService.deprovision_user(
            db_session,
            settings=native_context,
            user=test_user_employee,
            actor=test_user,
            trigger="manual",
            sync_status="missing",
            deprovision_reason="missing",
        ),
    ]:
        with pytest.raises(AuthorizationError):
            await operation
    await db_session.refresh(test_user_employee)
    assert test_user_employee.is_active and test_user_employee.token_version == version
    assert calls == [] and constructor.call_count == 0
    assert await db_session.get(User, test_user_employee.id) is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_role", ["admin", "cro", "employee"])
@pytest.mark.parametrize("target_state", ["invited", "enrolled", "suspended", "recovery_pending", "privileged"])
async def test_identity_capabilities_distinguish_actor_and_target(
    test_user,
    test_user_cro,
    test_user_employee,
    db_session,
    actor_role,
    target_state,
):
    from app.core.datetime_utils import utc_now
    from app.models import User
    from app.models.user import AccessScope
    from app.services._access_workflow.policy import access_user_capabilities
    from app.services.identity_capabilities import current_identity_capabilities

    actor = {"admin": test_user, "cro": test_user_cro, "employee": test_user_employee}[actor_role]
    actor.local_enrollment_state = "enrolled"
    actor.local_email_verified_at = utc_now()
    target = User(
        id=9001,
        name="Target",
        email="target@example.com",
        role=test_user_employee.role,
        is_active=True,
        local_suspended=False,
        local_recovery_pending=False,
        token_version=0,
        local_enrollment_state="enrolled",
        local_email_verified_at=utc_now(),
        access_scope=AccessScope.DEPARTMENT,
    )
    if target_state == "invited":
        target.local_enrollment_state, target.is_active = "invited", False
    elif target_state == "suspended":
        target.local_suspended, target.is_active = True, False
    elif target_state == "recovery_pending":
        target.local_recovery_pending, target.is_active = True, False
    elif target_state == "privileged":
        target.role, target.access_scope = test_user_cro.role, AccessScope.GLOBAL
    settings = native_settings()
    caps = access_user_capabilities(actor, target, settings=settings)
    admin = actor_role == "admin"
    assert current_identity_capabilities(actor, settings).can_invite_users is admin
    assert caps.can_reissue_invitation is (admin and target_state == "invited")
    assert caps.can_cancel_invitation is (admin and target_state == "invited")
    assert caps.can_request_password_reset is (admin and target_state in {"enrolled", "privileged"})
    assert caps.can_initiate_recovery is (admin and target_state in {"enrolled", "recovery_pending"})
    assert caps.recovery_offline_required is (admin and target_state == "privileged")
    assert not caps.can_check_directory
    assert caps.can_edit_business_access is (actor_role == "cro")
    if target_state in {"invited", "recovery_pending"}:
        assert not caps.can_resume


@pytest.mark.asyncio
async def test_direct_native_import_bootstrap_and_jobs_reject_before_work(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.services._identity_access_lifecycle.directory_import import import_directory_identity
    from scripts import bootstrap_sso_user

    settings = native_settings()
    database = Mock(side_effect=AssertionError("Database work reached"))
    with pytest.raises(AuthorizationError):
        await import_directory_identity(
            db=database, settings=settings, current_user=None, directory_user=None, payload=None, provider_name="graph"
        )
    monkeypatch.setattr(bootstrap_sso_user, "get_settings", lambda: settings)
    monkeypatch.setattr(bootstrap_sso_user, "session_context", database)
    with pytest.raises(AuthorizationError):
        await bootstrap_sso_user._run(SimpleNamespace(email="operator@example.com", external_id="supplied-id"))
    tracked = AsyncMock(side_effect=AssertionError("Disabled job recorded a run"))
    monkeypatch.setattr(scheduler_jobs, "get_settings", lambda: settings)
    monkeypatch.setattr(scheduler_jobs, "execute_tracked_job", tracked)
    for operation in (scheduler_jobs.run_ad_deprovision_check, scheduler_jobs.run_sso_jwks_refresh):
        with pytest.raises(AuthorizationError):
            await operation()
    tracked.assert_not_called()
    database.assert_not_called()


def test_native_app_composition_attempts_no_microsoft_connections():
    import subprocess
    import sys
    from pathlib import Path

    code = """
import asyncio
import socket
from unittest.mock import Mock
from app.core.config import Settings
import app.services.directory_provider_service as directory
original = socket.getaddrinfo
attempts = []
def observe(host, *args, **kwargs):
    if "microsoft" in str(host).lower():
        attempts.append(host)
        raise AssertionError("Microsoft network attempt")
    return original(host, *args, **kwargs)
socket.getaddrinfo = observe
provider = Mock(side_effect=AssertionError("External provider constructed"))
directory.GraphDirectoryService = provider
directory._ADEmulatorDirectoryService = provider
from app.main import create_app
settings = Settings(
    _env_file=None, debug=True, mock_auth_enabled=False, auth_mode="password",
    directory_provider="none", entra_tenant_id=None, entra_client_id=None,
)
app = create_app(settings)
assert app.state.settings.directory_provider == "none"
assert attempts == [] and provider.call_count == 0
asyncio.run(app.state.db_engine.dispose())
"""
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=Path(__file__).resolve().parents[3] / "backend",
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.asyncio
async def test_recovery_pending_resume_is_denied_without_invalidating_recovery(
    native_context, client_factory, db_session, test_user, test_user_employee
):
    import pyotp

    from app.core.security import get_password_hash
    from app.models import LocalAuthGrant, User
    from tests.backend.pytest.test_local_identity import (
        PASSWORD,
        create_invitation,
        csrf,
        enroll,
        latest_mail,
        login_password_only,
    )
    from tests.backend.pytest.test_local_recovery import recent

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
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await login_password_only(client, test_user.email, PASSWORD)
        proof = await recent(
            client,
            user_id,
            None,
            "assisted_recovery",
            expected_token_version=target.token_version,
            intended_recovery_operation="factor_recovery",
        )
        result = await client.post(
            f"/api/v1/users/{user_id}/recovery",
            json={
                "recent_auth_proof": proof,
                "expected_token_version": target.token_version,
                "operation": "factor_recovery",
                "incident_reference": "INC-resume-regression",
                "verification_method": "in-person",
                "reason": "Verified loss of factor",
            },
        )
        assert result.status_code == 202, result.text
        delivery, recovery = await latest_mail(
            db_session, native_context, user_id=user_id, kind="recovery"
        )
        await db_session.refresh(target)
        pending_version = target.token_version
        for path in [f"/api/v1/access/users/{user_id}", f"/api/v1/users/{user_id}"]:
            denied = await client.patch(path, json={"is_active": True})
            assert denied.status_code == 403, (path, denied.text)
            assert denied.json()["detail"]["code"] == "RECOVERY_PENDING"
            await db_session.refresh(target)
            grant = await db_session.get(
                LocalAuthGrant, delivery.grant_id, populate_existing=True
            )
            assert (
                target.local_recovery_pending
                and not target.is_active
                and not target.local_suspended
            )
            assert target.token_version == pending_version
            assert grant.revoked_at is None and grant.consumed_at is None
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        started = await client.post(
            "/api/v1/auth/local/recovery/start",
            json={"grant": recovery["credential"], "current_password": PASSWORD},
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
        await db_session.refresh(target)
        assert target.is_active and not target.local_recovery_pending
