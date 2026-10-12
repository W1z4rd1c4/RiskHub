"""Installation-binding evidence; no deployment enablement or provider conversion."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import ActivityLog, InstallationIdentity, RefreshToken, Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.directory import DirectoryUserRead
from app.services.identity_installation import (
    IdentityBindingError,
    establish_installation_binding,
    validate_installation_binding,
)
from tests.backend.pytest.test_identity_foundations import TENANT, identity_settings
from tests.backend.pytest.test_local_identity import PASSWORD, create_invitation, csrf, latest_mail


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["microsoft_sso", "password"])
async def test_binding_fresh_tuple_and_same_profile_restart(db_session, mode):
    settings = (
        identity_settings()
        if mode == "microsoft_sso"
        else identity_settings(
            auth_mode="password",
            directory_provider="none",
            entra_tenant_id=None,
            entra_client_id=None,
            entra_client_secret=None,
        )
    )
    binding = await establish_installation_binding(db_session, settings=settings, source="fixture/change194")
    assert str(UUID(binding.installation_id)) == binding.installation_id
    expected = (mode, TENANT if mode == "microsoft_sso" else None, 1)
    assert (binding.auth_mode, binding.tenant_id, binding.contract_version) == expected
    assert binding.established_at is not None and binding.establishment_source == "fixture/change194"
    again = await establish_installation_binding(db_session, settings=settings, source="repeat")
    assert again.installation_id == binding.installation_id
    if mode == "microsoft_sso":
        # Rotation changes installed credentials, never installation identity.
        settings = settings.model_copy(update={"entra_client_secret": "rotated-fixture-value"})
    verified = await validate_installation_binding(db_session, settings=settings)
    assert (verified.auth_mode, verified.tenant_id, verified.contract_version) == expected
    assert verified.installation_id == binding.installation_id
    assert not (await db_session.execute(select(User))).scalars().all()


@pytest.mark.asyncio
@pytest.mark.parametrize("damage", ["mode", "tenant", "identifier", "reader_version"])
async def test_binding_drift_and_malformed_state_refuse_without_writes(db_session, monkeypatch, damage):
    settings = identity_settings()
    binding = await establish_installation_binding(db_session, settings=settings, source="fixture")
    if damage == "mode":
        settings = identity_settings(
            auth_mode="password",
            directory_provider="none",
            entra_tenant_id=None,
            entra_client_id=None,
            entra_client_secret=None,
        )
    elif damage == "tenant":
        settings = identity_settings(entra_tenant_id=str(uuid4()))
    elif damage == "identifier":
        binding.installation_id = "not-a-uuid"
        await db_session.commit()
    else:
        monkeypatch.setattr("app.services.identity_installation.IDENTITY_CONTRACT_VERSION", 999)
    before = (binding.installation_id, binding.auth_mode, binding.tenant_id, binding.contract_version)
    with pytest.raises(IdentityBindingError):
        await validate_installation_binding(db_session, settings=settings)
    await db_session.refresh(binding)
    assert (binding.installation_id, binding.auth_mode, binding.tenant_id, binding.contract_version) == before
    assert not (await db_session.execute(select(User))).scalars().all()


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["valid", "deleted", "wrong_subject"])
async def test_verified_adoption_preserves_literal_access_and_references(
    db_session, test_user, test_user_employee, test_risk, monkeypatch, outcome
):
    users = (await db_session.execute(select(User).order_by(User.id))).scalars().all()
    for user in users:
        user.external_id = str(uuid4())
    test_user_employee.manager_id = test_user.id
    test_risk.owner_id = test_user_employee.id
    audit = ActivityLog(
        entity_type=ActivityEntityType.USER,
        entity_id=test_user_employee.id,
        entity_name="Fixture target",
        action=ActivityAction.UPDATE,
        actor_id=test_user.id,
        actor_name="Fixture actor",
        description="Existing reference",
    )
    db_session.add(audit)
    await db_session.commit()
    user_query = select(
        User.id,
        User.external_id,
        User.hashed_password,
        User.role_id,
        User.department_id,
        User.manager_id,
        User.access_scope,
        User.token_version,
    ).order_by(User.id)
    before = (await db_session.execute(user_query)).all()
    risk_reference, audit_reference = (test_risk.id, test_risk.owner_id), (audit.id, audit.actor_id, audit.entity_id)
    seen = []
    expected_subjects = [user.external_id for user in users]

    async def directory(self, oid):
        assert self._settings.entra_tenant_id == TENANT
        seen.append(oid)
        if outcome == "deleted":
            raise LookupError("fixture directory absence")
        return DirectoryUserRead(
            external_id=oid if outcome == "valid" else str(uuid4()),
            display_name="Verified fixture",
            email="verified@example.com",
            account_enabled=True,
            source="graph",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", directory)
    settings = identity_settings()
    if outcome == "valid":
        await establish_installation_binding(
            db_session, settings=settings, source="operator/fixture194", adopt_entra=True, dry_run=True
        )
        assert not (await db_session.execute(select(InstallationIdentity))).scalars().all()
        assert seen == expected_subjects
        async with async_sessionmaker(db_session.bind, expire_on_commit=False)() as observer:
            assert (await observer.execute(user_query)).all() == before
            risk = await observer.get(Risk, risk_reference[0])
            persisted_audit = await observer.get(ActivityLog, audit_reference[0])
            assert (risk.id, risk.owner_id) == risk_reference
            assert (persisted_audit.id, persisted_audit.actor_id, persisted_audit.entity_id) == audit_reference
        seen.clear()
        await establish_installation_binding(
            db_session, settings=settings, source="operator/fixture194", adopt_entra=True
        )
    else:
        with pytest.raises(IdentityBindingError, match="cannot verify"):
            await establish_installation_binding(
                db_session, settings=settings, source="operator/fixture194", adopt_entra=True
            )
    assert seen == (expected_subjects if outcome == "valid" else expected_subjects[:1])
    async with async_sessionmaker(db_session.bind, expire_on_commit=False)() as observer:
        assert (await observer.execute(user_query)).all() == before
        risk = await observer.get(Risk, risk_reference[0])
        persisted_audit = await observer.get(ActivityLog, audit_reference[0])
        assert (risk.id, risk.owner_id) == risk_reference
        assert (persisted_audit.id, persisted_audit.actor_id, persisted_audit.entity_id) == audit_reference
        bindings = (await observer.execute(select(InstallationIdentity))).scalars().all()
        assert len(bindings) == (1 if outcome == "valid" else 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("drift", ["none", "api", "scheduler"])
async def test_api_and_scheduler_use_real_binding_and_restore_admission(db_session, async_engine, monkeypatch, drift):
    from app import main
    from app.core import scheduler_runtime

    settings = identity_settings(debug=False)
    await establish_installation_binding(db_session, settings=settings, source="admission-fixture")
    mismatched = settings.model_copy(update={"entra_tenant_id": str(uuid4())})
    api_settings = mismatched if drift == "api" else settings
    scheduler_settings = mismatched if drift == "scheduler" else settings
    maker = async_sessionmaker(async_engine, expire_on_commit=False)
    app = FastAPI()
    app.state.settings, app.state.db_engine, app.state.db_sessionmaker = api_settings, async_engine, maker
    runtime = AsyncMock()
    monkeypatch.setattr(main, "bootstrap_runtime_services", runtime)
    monkeypatch.setattr(main, "stop_scheduler_async", AsyncMock())
    if drift == "api":
        with pytest.raises(IdentityBindingError, match="tenant"):
            async with main.lifespan(app):
                pytest.fail("Mismatched API must not admit traffic")
        runtime.assert_not_awaited()
    else:
        async with main.lifespan(app):
            assert app.state.installation_id
            # Admission is complete; teardown must not dispose the shared fixture engine.
            app.state.db_engine = None
        runtime.assert_awaited_once()
    provider = SimpleNamespace(acquire=AsyncMock(return_value=False), provider_name="fixture")
    resolve = Mock(return_value=provider)
    state = SimpleNamespace(
        db_sessionmaker=maker,
        db_engine=async_engine,
        scheduler=SimpleNamespace(running=False),
        process_instance_id="fixture",
    )
    monkeypatch.setenv("ENABLE_SCHEDULER", "true")
    monkeypatch.setattr(scheduler_runtime, "runtime_state", state)
    monkeypatch.setattr("app.core.config.get_settings", lambda: scheduler_settings)
    monkeypatch.setattr(scheduler_runtime, "resolve_lock_provider", resolve)
    if drift == "scheduler":
        with pytest.raises(IdentityBindingError, match="tenant"):
            await scheduler_runtime.start_scheduler_async()
        resolve.assert_not_called()
        provider.acquire.assert_not_awaited()
    else:
        await scheduler_runtime.start_scheduler_async()
        provider.acquire.assert_awaited_once()
    # Real restore admission is retained: a fresh installation legitimately has no cutover/sidecar.


@pytest.mark.asyncio
async def test_native_linked_row_with_valid_password_fails_closed_then_unlinked_succeeds(
    native_context, client_factory, db_session, test_user, test_user_employee
):
    native_context.local_mfa_policy = "optional"
    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, invitation = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        enrolled = await client.post(
            "/api/v1/auth/local/enrollment/start", json={"grant": invitation["credential"], "password": PASSWORD}
        )
        assert enrolled.status_code == 202 and enrolled.json()["status"] == "completed"
        user = await db_session.get(User, uid, populate_existing=True)
        original_hash = user.hashed_password
        user.external_id = str(uuid4())
        await db_session.commit()
        denied = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
        assert denied.status_code == 503, denied.text
        assert not (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == uid))).scalars().all()
        await db_session.refresh(user)
        assert user.hashed_password == original_hash
        # This is actual native binding fail-closed evidence, not isolated legacy-route guard coverage.
        user.external_id = None
        await db_session.commit()
        success = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
        assert success.status_code == 200 and "access_token" in success.json(), success.text
