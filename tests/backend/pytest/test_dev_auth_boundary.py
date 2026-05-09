from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.core.config import Settings


@pytest_asyncio.fixture
async def dev_auth_client(client_factory) -> AsyncClient:
    settings = Settings(
        debug=True,
        secret_key="test-secret-key-32-chars-minimum-value",
        mock_auth_enabled=True,
        auth_mode="hybrid_dev",
    )
    async with client_factory(settings=settings) as ac:
        yield ac


@pytest.mark.asyncio
async def test_demo_login_returns_404_when_not_hybrid(client, test_user):
    response = await client.post("/api/v1/auth/demo-login", json={"email": test_user.email})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_openapi_hides_dev_auth_routes(dev_auth_client: AsyncClient):
    response = await dev_auth_client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json().get("paths", {})

    assert "/api/v1/auth/demo-login" not in paths
    assert "/api/v1/auth/demo-login/{user_id}" not in paths
    assert "/api/v1/users/mock-login/{user_id}" not in paths


@pytest.mark.asyncio
async def test_mock_login_returns_404_when_mock_auth_disabled(client_factory, test_user):
    settings = Settings(
        debug=True,
        secret_key="test-secret-key-32-chars-minimum-value",
        mock_auth_enabled=False,
        auth_mode="hybrid_dev",
    )
    async with client_factory(settings=settings) as ac:
        response = await ac.post(f"/api/v1/users/mock-login/{test_user.id}")

    assert response.status_code == 404
