from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.main import app
from app.models import Department, User
from app.schemas.directory import DirectoryUserRead
from app.services.ad_deprovision_service import ADDeprovisionService


@pytest_asyncio.fixture
async def directory_import_client(
    db_session: AsyncSession,
    test_user_platform_admin,
) -> AsyncClient:
    async def override_get_db():
        yield db_session

    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
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


@pytest.mark.asyncio
async def test_directory_import_creates_user_and_department(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    monkeypatch,
):
    async def stub_get_user(self, external_id: str):
        assert external_id == "oid-import-create"
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Imported User",
            email="imported.user@example.com",
            user_principal_name="imported.user@example.com",
            department="Enterprise Risk",
            job_title="Senior Risk Analyst",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client.post("/api/v1/directory/users/oid-import-create/import", json={})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "created"
    assert payload["external_id"] == "oid-import-create"

    user = (
        await db_session.execute(select(User).where(User.external_id == "oid-import-create"))
    ).scalar_one()
    assert user.email == "imported.user@example.com"
    assert user.job_title == "Senior Risk Analyst"
    assert user.directory_sync_status == "active"

    department = (
        await db_session.execute(select(Department).where(Department.id == user.department_id))
    ).scalar_one()
    assert department.name == "Enterprise Risk"


@pytest.mark.asyncio
async def test_directory_reimport_updates_existing_user_without_duplication(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    monkeypatch,
):
    test_user_employee.external_id = "oid-existing-import"
    db_session.add(test_user_employee)
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Employee Updated",
            email=test_user_employee.email,
            user_principal_name=test_user_employee.email,
            department="Updated Department",
            job_title="Updated Title",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client.post(
        f"/api/v1/directory/users/{test_user_employee.external_id}/import",
        json={},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "updated"

    users = (
        await db_session.execute(select(User).where(User.email == test_user_employee.email))
    ).scalars().all()
    assert len(users) == 1
    assert users[0].name == "Employee Updated"
    assert users[0].job_title == "Updated Title"


@pytest.mark.asyncio
async def test_directory_import_detects_external_id_email_collision(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    monkeypatch,
):
    test_user_employee.external_id = "oid-already-linked"
    db_session.add(test_user_employee)
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Conflicting Identity",
            email=test_user_employee.email,
            user_principal_name=test_user_employee.email,
            department="Risk",
            job_title="Role",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client.post("/api/v1/directory/users/oid-other/import", json={})
    assert response.status_code == 409
    assert "identity conflict" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_directory_import_reactivates_user_for_auto_deprovision_reasons(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    monkeypatch,
):
    test_user_employee.external_id = "oid-reactivate-import"
    test_user_employee.is_active = False
    test_user_employee.directory_sync_status = "directory_disabled"
    test_user_employee.deprovision_reason = ADDeprovisionService.DEPROVISION_REASON_DIRECTORY_DISABLED
    db_session.add(test_user_employee)
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Reactivated By Import",
            email=test_user_employee.email,
            user_principal_name=test_user_employee.email,
            department="Risk",
            job_title="Analyst",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client.post("/api/v1/directory/users/oid-reactivate-import/import", json={})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "updated"

    refreshed_user = (
        await db_session.execute(select(User).where(User.external_id == "oid-reactivate-import"))
    ).scalar_one()
    assert refreshed_user.is_active is True
    assert refreshed_user.deprovision_reason is None
    assert refreshed_user.deprovisioned_at is None
    assert refreshed_user.directory_sync_status == "active"
