import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_docs_enabled_in_debug_mode():
    app = create_app(
        Settings(
            debug=True,
            secret_key="test-secret",
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
            secret_key="test-secret",
            mock_auth_enabled=False,
            cors_origins=["http://testserver"],
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
            secret_key="test-secret",
            mock_auth_enabled=False,
            cors_origins=["http://testserver"],
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
        create_app(Settings(debug=False, secret_key="test-secret", mock_auth_enabled=False, cors_origins=["*"]))


def test_cors_guard_requires_explicit_allowlist_in_production_mode():
    with pytest.raises(RuntimeError):
        create_app(Settings(debug=False, secret_key="test-secret", mock_auth_enabled=False, cors_origins=[]))
