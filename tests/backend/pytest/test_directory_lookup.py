from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.core.config import Settings
from app.schemas.directory import DirectoryUserRead


@pytest_asyncio.fixture
async def directory_admin_client(
    client_factory,
    test_user_platform_admin,
) -> AsyncClient:
    settings = Settings(
        debug=True,
        secret_key="test-secret-key-32-chars-minimum-value",
        mock_auth_enabled=True,
        directory_provider="ad_emulator",
        ad_emulator_base_url="http://ad-emulator.local",
    )
    async with client_factory(user=test_user_platform_admin, settings=settings) as ac:
        yield ac


@pytest_asyncio.fixture
async def directory_employee_client(
    client_factory,
    test_user_employee,
) -> AsyncClient:
    settings = Settings(
        debug=True,
        secret_key="test-secret-key-32-chars-minimum-value",
        mock_auth_enabled=True,
        directory_provider="ad_emulator",
        ad_emulator_base_url="http://ad-emulator.local",
    )
    async with client_factory(user=test_user_employee, settings=settings) as ac:
        yield ac


@pytest.mark.asyncio
async def test_directory_search_returns_results(directory_admin_client: AsyncClient, monkeypatch):
    async def stub_search(self, *, query: str, limit: int = 25, skip: int = 0):
        assert query == "john"
        assert limit == 10
        assert skip == 0
        return [
            DirectoryUserRead(
                external_id="oid-123",
                display_name="John Doe",
                email="john@example.com",
                user_principal_name="john@example.com",
                department="Risk",
                job_title="Risk Manager",
                account_enabled=True,
                source="ad_emulator",
            )
        ]

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.search_users", stub_search)

    response = await directory_admin_client.get("/api/v1/directory/users/search?q=john&limit=10")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload[0]["external_id"] == "oid-123"
    assert payload[0]["email"] == "john@example.com"


@pytest.mark.asyncio
async def test_directory_get_user_returns_details(directory_admin_client: AsyncClient, monkeypatch):
    async def stub_get_user(self, external_id: str):
        assert external_id == "oid-777"
        return DirectoryUserRead(
            external_id="oid-777",
            display_name="Jane Roe",
            email="jane@example.com",
            user_principal_name="jane@example.com",
            department="Finance",
            job_title="Analyst",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_admin_client.get("/api/v1/directory/users/oid-777")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["external_id"] == "oid-777"
    assert payload["display_name"] == "Jane Roe"


@pytest.mark.asyncio
async def test_directory_endpoints_require_admin(
    directory_employee_client: AsyncClient,
):
    response = await directory_employee_client.get("/api/v1/directory/users/search?q=x")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_directory_search_requires_admin_for_cro(client_cro: AsyncClient):
    response = await client_cro.get("/api/v1/directory/users/search?q=x")
    assert response.status_code == 403
    assert response.json()["detail"] == "Directory access requires Admin"
