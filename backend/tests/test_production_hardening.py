import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import DEFAULT_DATABASE_URL, create_app


PRODUCTION_SECRET = "test-secret-for-production-mode-123456"
PRODUCTION_DATABASE_URL = "postgresql+asyncpg://riskhub:tests@prod-db:5432/riskhub"
PRODUCTION_AUTH_MODE = "microsoft_sso"
PRODUCTION_ENTRA_TENANT_ID = "00000000-0000-0000-0000-000000000000"
PRODUCTION_ENTRA_CLIENT_ID = "11111111-1111-1111-1111-111111111111"


@pytest.mark.asyncio
async def test_docs_enabled_in_debug_mode():
    app = create_app(
        Settings(
            debug=True,
            secret_key=PRODUCTION_SECRET,
            mock_auth_enabled=False,
            cors_origins=["http://testserver"],
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.get("/docs")
        assert res.status_code == 200


@pytest.mark.asyncio
async def test_docs_disabled_in_production_mode():
    app = create_app(
        Settings(
            debug=False,
            secret_key=PRODUCTION_SECRET,
            mock_auth_enabled=False,
            auth_mode=PRODUCTION_AUTH_MODE,
            entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
            entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
            cors_origins=["http://testserver"],
            database_url=PRODUCTION_DATABASE_URL,
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        docs = await client.get("/docs")
        assert docs.status_code == 404

        openapi = await client.get("/openapi.json")
        assert openapi.status_code == 404


@pytest.mark.asyncio
async def test_trusted_host_blocks_unexpected_host_in_production_mode():
    app = create_app(
        Settings(
            debug=False,
            secret_key=PRODUCTION_SECRET,
            mock_auth_enabled=False,
            auth_mode=PRODUCTION_AUTH_MODE,
            entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
            entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
            cors_origins=["http://testserver"],
            database_url=PRODUCTION_DATABASE_URL,
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ok = await client.get("/api/v1/health")
        assert ok.status_code == 200

        blocked = await client.get("/api/v1/health", headers={"host": "evil.example"})
        assert blocked.status_code == 400


def test_cors_guard_rejects_wildcard_origins_in_production_mode():
    with pytest.raises(RuntimeError):
        create_app(
            Settings(
                debug=False,
                secret_key=PRODUCTION_SECRET,
                mock_auth_enabled=False,
                auth_mode=PRODUCTION_AUTH_MODE,
                entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
                entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
                cors_origins=["*"],
                database_url=PRODUCTION_DATABASE_URL,
            )
        )


def test_cors_guard_requires_explicit_allowlist_in_production_mode():
    with pytest.raises(RuntimeError):
        create_app(
            Settings(
                debug=False,
                secret_key=PRODUCTION_SECRET,
                mock_auth_enabled=False,
                auth_mode=PRODUCTION_AUTH_MODE,
                entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
                entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
                cors_origins=[],
                database_url=PRODUCTION_DATABASE_URL,
            )
        )


def test_auth_mode_guard_requires_microsoft_sso_in_production():
    with pytest.raises(RuntimeError, match="AUTH_MODE must be 'microsoft_sso'"):
        create_app(
            Settings(
                debug=False,
                secret_key=PRODUCTION_SECRET,
                mock_auth_enabled=False,
                auth_mode="password",
                entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
                entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
                cors_origins=["http://testserver"],
                database_url=PRODUCTION_DATABASE_URL,
            )
        )


def test_auth_mode_guard_requires_entra_config_in_production():
    with pytest.raises(RuntimeError, match="ENTRA_TENANT_ID and ENTRA_CLIENT_ID are required"):
        create_app(
            Settings(
                debug=False,
                secret_key=PRODUCTION_SECRET,
                mock_auth_enabled=False,
                auth_mode=PRODUCTION_AUTH_MODE,
                entra_tenant_id=None,
                entra_client_id=None,
                cors_origins=["http://testserver"],
                database_url=PRODUCTION_DATABASE_URL,
            )
        )


def test_secret_key_length_guard_triggers_in_production():
    with pytest.raises(RuntimeError, match="SECRET_KEY must be at least 32 characters"):
        create_app(
            Settings(
                debug=False,
                secret_key="too-short",
                mock_auth_enabled=False,
                auth_mode=PRODUCTION_AUTH_MODE,
                entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
                entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
                cors_origins=["http://testserver"],
                database_url=PRODUCTION_DATABASE_URL,
            )
        )


def test_database_url_default_guard_triggers_in_production():
    with pytest.raises(RuntimeError, match="DATABASE_URL must be explicitly configured"):
        create_app(
            Settings(
                debug=False,
                secret_key=PRODUCTION_SECRET,
                mock_auth_enabled=False,
                auth_mode=PRODUCTION_AUTH_MODE,
                entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
                entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
                cors_origins=["http://testserver"],
                database_url=DEFAULT_DATABASE_URL,
            )
        )
