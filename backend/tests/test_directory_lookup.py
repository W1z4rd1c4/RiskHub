from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.main import app
from app.schemas.directory import DirectoryUserRead


@pytest_asyncio.fixture
async def directory_admin_client(
    db_session: AsyncSession,
    test_user_platform_admin,
) -> AsyncClient:
    async def override_get_db():
        yield db_session

    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key",
            mock_auth_enabled=True,
            directory_provider="ad_emulator",
            ad_emulator_base_url="http://ad-emulator.local",
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_platform_admin.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def directory_employee_client(
    db_session: AsyncSession,
    test_user_employee,
) -> AsyncClient:
    async def override_get_db():
        yield db_session

    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key",
            mock_auth_enabled=True,
            directory_provider="ad_emulator",
            ad_emulator_base_url="http://ad-emulator.local",
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_employee.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac

    app.dependency_overrides.clear()


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
async def test_directory_endpoints_require_admin_or_cro(
    directory_employee_client: AsyncClient,
):
    response = await directory_employee_client.get("/api/v1/directory/users/search?q=x")
    assert response.status_code == 403
