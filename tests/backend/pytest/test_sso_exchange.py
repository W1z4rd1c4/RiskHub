from __future__ import annotations

from datetime import timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.datetime_utils import utc_now
from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES
from app.db.session import get_db
from app.main import app
from app.models import Role, User
from app.services.sso_token_service import VerifiedIdentity


@pytest_asyncio.fixture(scope="function")
async def sso_client(db_session: AsyncSession) -> AsyncClient:
    async def override_get_db():
        yield db_session

    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=True,
            cors_origins=["http://test"],
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_sso_exchange_success_external_id_match(
    sso_client: AsyncClient, db_session: AsyncSession, test_user: User, monkeypatch
):
    test_user.external_id = "oid-123"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-123",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert "access_token" in body
    assert body["user"]["email"] == test_user.email


@pytest.mark.asyncio
async def test_sso_start_and_exchange_strict_mode_returns_server_redirect(
    sso_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-strict-flow"
    db_session.add(test_user)
    await db_session.commit()

    def override_settings_strict():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=True,
            auth_sso_require_challenge=True,
            cors_origins=["http://test"],
        )

    app.dependency_overrides[get_settings] = override_settings_strict

    start = await sso_client.post(
        "/api/v1/auth/sso/start",
        json={"return_to": "/risks"},
        headers={"Origin": "http://test"},
    )
    assert start.status_code == 200, start.text
    start_payload = start.json()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-strict-flow",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
            nonce=start_payload["nonce"],
            expires_at=utc_now() + timedelta(minutes=10),
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    exchange = await sso_client.post(
        "/api/v1/auth/sso/exchange",
        json={"id_token": "fake", "state": start_payload["state"]},
    )
    assert exchange.status_code == 200, exchange.text
    assert exchange.json()["post_login_redirect_to"] == "/risks"


@pytest.mark.asyncio
async def test_sso_exchange_strict_mode_rejects_stale_tab_challenge(
    sso_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-stale-tab"
    db_session.add(test_user)
    await db_session.commit()

    def override_settings_strict():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=True,
            auth_sso_require_challenge=True,
            cors_origins=["http://test"],
        )

    app.dependency_overrides[get_settings] = override_settings_strict

    first_start = await sso_client.post(
        "/api/v1/auth/sso/start",
        json={"return_to": "/first"},
        headers={"Origin": "http://test"},
    )
    second_start = await sso_client.post(
        "/api/v1/auth/sso/start",
        json={"return_to": "/second"},
        headers={"Origin": "http://test"},
    )
    first_payload = first_start.json()
    _ = second_start.json()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-stale-tab",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
            nonce=first_payload["nonce"],
            expires_at=utc_now() + timedelta(minutes=10),
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    exchange = await sso_client.post(
        "/api/v1/auth/sso/exchange",
        json={"id_token": "fake", "state": first_payload["state"]},
    )
    assert exchange.status_code == 401, exchange.text
    assert exchange.json()["code"] == "SSO_STATE_MISMATCH"


@pytest.mark.asyncio
async def test_sso_exchange_disabled_in_password_mode(sso_client: AsyncClient):
    def override_settings_password_mode():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="password",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
        )

    app.dependency_overrides[get_settings] = override_settings_password_mode

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 403
    assert res.json()["code"] == "SSO_DISABLED"


@pytest.mark.asyncio
async def test_sso_exchange_links_user_by_email_when_external_id_null(
    sso_client: AsyncClient, db_session: AsyncSession, test_user: User, monkeypatch
):
    assert test_user.external_id is None

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-linked",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 200

    refreshed = (await db_session.execute(select(User).where(User.id == test_user.id))).scalar_one()
    assert refreshed.external_id == "oid-linked"


@pytest.mark.asyncio
async def test_sso_exchange_requires_explicit_link_when_email_linking_disabled(
    sso_client: AsyncClient, db_session: AsyncSession, test_user: User, monkeypatch
):
    assert test_user.external_id is None

    def override_settings_email_link_off():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=False,
            auth_sso_allow_email_link=False,
            cors_origins=["http://test"],
        )

    app.dependency_overrides[get_settings] = override_settings_email_link_off

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-link-required",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 403, res.text
    assert res.json()["code"] == "SSO_LINK_REQUIRED"


@pytest.mark.asyncio
async def test_sso_exchange_rejects_email_conflict(
    sso_client: AsyncClient, db_session: AsyncSession, test_user: User, monkeypatch
):
    test_user.external_id = "oid-existing"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-other",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 409, res.text
    assert res.json()["code"] == "SSO_IDENTITY_COLLISION"


@pytest.mark.asyncio
async def test_sso_exchange_jit_creates_unknown_user(sso_client: AsyncClient, db_session: AsyncSession, monkeypatch):
    # Seed a safe default role for JIT provisioning (test DB only seeds admin by default).
    db_session.add(
        Role(
            name=SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES[0].value,
            display_name="Employee",
            description="Default employee role for SSO JIT tests",
        )
    )
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-unknown",
            tenant_id=settings.entra_tenant_id or "",
            email="Unknown@Example.com",
            name="Unknown",
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 200

    created = (
        await db_session.execute(
            select(User).options(selectinload(User.role)).where(User.email == "unknown@example.com")
        )
    ).scalar_one()
    assert created.hashed_password is None
    assert created.external_id == "oid-unknown"
    assert created.role.name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES


@pytest.mark.asyncio
async def test_sso_exchange_syncs_linked_user_profile_fields(
    sso_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-profile-sync"
    test_user.name = "Old Name"
    test_user.email = "old.profile@example.com"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-profile-sync",
            tenant_id=settings.entra_tenant_id or "",
            email="new.profile@example.com",
            name="New Name",
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 200, res.text

    refreshed = (await db_session.execute(select(User).where(User.id == test_user.id))).scalar_one()
    assert refreshed.email == "new.profile@example.com"
    assert refreshed.name == "New Name"


@pytest.mark.asyncio
async def test_sso_exchange_updates_entra_business_role_from_token_when_present(
    sso_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-business-role"
    db_session.add(test_user)
    await db_session.commit()

    def override_settings_business_role():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=True,
            entra_business_role_attribute_name="riskhubBusinessRole",
            cors_origins=["http://test"],
        )

    app.dependency_overrides[get_settings] = override_settings_business_role

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-business-role",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
            business_role="Regional Director",
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 200, res.text
    assert res.json()["user"]["entra_business_role"] == "Regional Director"

    refreshed = (await db_session.execute(select(User).where(User.id == test_user.id))).scalar_one()
    assert refreshed.entra_business_role == "Regional Director"
    assert refreshed.entra_business_role_last_synced_at is not None


@pytest.mark.asyncio
async def test_sso_exchange_does_not_clear_entra_business_role_when_token_claim_absent(
    sso_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-business-role-absent"
    test_user.entra_business_role = "Existing Role"
    db_session.add(test_user)
    await db_session.commit()

    def override_settings_business_role():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=True,
            entra_business_role_attribute_name="riskhubBusinessRole",
            cors_origins=["http://test"],
        )

    app.dependency_overrides[get_settings] = override_settings_business_role

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-business-role-absent",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
            business_role=None,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 200, res.text
    assert res.json()["user"]["entra_business_role"] == "Existing Role"

    refreshed = (await db_session.execute(select(User).where(User.id == test_user.id))).scalar_one()
    assert refreshed.entra_business_role == "Existing Role"


@pytest.mark.asyncio
async def test_auth_me_includes_entra_business_role_after_sso_login(
    sso_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-me-business-role"
    db_session.add(test_user)
    await db_session.commit()

    def override_settings_business_role():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=True,
            entra_business_role_attribute_name="riskhubBusinessRole",
            cors_origins=["http://test"],
        )

    app.dependency_overrides[get_settings] = override_settings_business_role

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-me-business-role",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
            business_role="Claims Manager",
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200, login.text
    access_token = login.json()["access_token"]

    me = await sso_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200, me.text
    assert me.json()["entra_business_role"] == "Claims Manager"


@pytest.mark.asyncio
async def test_sso_exchange_blocks_unknown_user_when_jit_disabled(
    sso_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    def override_settings_jit_disabled():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            entra_jit_provisioning_enabled=False,
        )

    app.dependency_overrides[get_settings] = override_settings_jit_disabled

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-unknown",
            tenant_id=settings.entra_tenant_id or "",
            email="unknown@example.com",
            name="Unknown",
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 403
    assert res.json()["code"] == "SSO_USER_NOT_PROVISIONED"


@pytest.mark.asyncio
async def test_sso_exchange_blocks_inactive_user(
    sso_client: AsyncClient, db_session: AsyncSession, test_user: User, monkeypatch
):
    test_user.external_id = "oid-inactive"
    test_user.is_active = False
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-inactive",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    res = await sso_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_password_login_disabled_in_microsoft_sso_mode(sso_client: AsyncClient):
    res = await sso_client.post("/api/v1/auth/login", json={"email": "admin@test.com", "password": "x"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_demo_login_requires_hybrid_dev_mode(sso_client: AsyncClient, test_user: User):
    by_id = await sso_client.post(f"/api/v1/auth/demo-login/{test_user.id}")
    assert by_id.status_code == 404

    by_email = await sso_client.post("/api/v1/auth/demo-login", json={"email": test_user.email})
    assert by_email.status_code == 404


@pytest.mark.asyncio
async def test_demo_login_by_email_succeeds_in_hybrid_dev_mode(sso_client: AsyncClient, test_user: User):
    def override_settings_hybrid_mode():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="hybrid_dev",
        )

    app.dependency_overrides[get_settings] = override_settings_hybrid_mode

    res = await sso_client.post("/api/v1/auth/demo-login", json={"email": test_user.email})
    assert res.status_code == 200, res.text
    assert res.json()["user"]["email"] == test_user.email


@pytest.mark.asyncio
async def test_demo_login_by_email_returns_404_for_unknown_user(sso_client: AsyncClient):
    def override_settings_hybrid_mode():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="hybrid_dev",
        )

    app.dependency_overrides[get_settings] = override_settings_hybrid_mode

    res = await sso_client.post("/api/v1/auth/demo-login", json={"email": "missing@test.com"})
    assert res.status_code == 404
