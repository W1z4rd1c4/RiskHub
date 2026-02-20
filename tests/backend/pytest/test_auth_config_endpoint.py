from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.config import Settings, get_settings
from app.main import app


@pytest.mark.asyncio
async def test_auth_config_password_mode(client: AsyncClient):
    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key",
            mock_auth_enabled=True,
            auth_mode="password",
        )

    app.dependency_overrides[get_settings] = override_settings
    try:
        res = await client.get("/api/v1/auth/config")
        assert res.status_code == 200
        body = res.json()
        assert body["auth_mode"] == "password"
        assert body["password_login_enabled"] is True
        assert body["demo_login_enabled"] is False
        assert body["sso"]["enabled"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_auth_config_hybrid_dev_enables_demo_and_optional_sso(client: AsyncClient):
    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key",
            mock_auth_enabled=True,
            auth_mode="hybrid_dev",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
        )

    app.dependency_overrides[get_settings] = override_settings
    try:
        res = await client.get("/api/v1/auth/config")
        assert res.status_code == 200
        body = res.json()
        assert body["auth_mode"] == "hybrid_dev"
        assert body["demo_login_enabled"] is True
        assert body["password_login_enabled"] is True
        assert body["sso"]["enabled"] is True
        assert body["sso"]["provider"] == "entra"
        assert body["sso"]["tenant_id"] == "00000000-0000-0000-0000-000000000000"
        assert body["sso"]["client_id"] == "11111111-1111-1111-1111-111111111111"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_auth_config_microsoft_sso_missing_config_sets_sso_error(client: AsyncClient):
    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id=None,
            entra_client_id=None,
        )

    app.dependency_overrides[get_settings] = override_settings
    try:
        res = await client.get("/api/v1/auth/config")
        assert res.status_code == 200
        body = res.json()
        assert body["auth_mode"] == "microsoft_sso"
        assert body["password_login_enabled"] is False
        assert body["sso"]["enabled"] is False
        assert body["sso_error"]
    finally:
        app.dependency_overrides.clear()
