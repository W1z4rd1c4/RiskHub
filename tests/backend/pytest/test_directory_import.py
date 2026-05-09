from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import Department, User
from app.schemas.directory import DirectoryUserRead
from app.services.ad_deprovision_service import ADDeprovisionService


@pytest_asyncio.fixture
async def directory_import_client(
    client_factory,
    test_user_platform_admin,
) -> AsyncClient:
    settings = Settings(
        debug=True,
        secret_key="test-secret-key-32-chars-minimum-value",
        mock_auth_enabled=True,
        directory_provider="ad_emulator",
        entra_business_role_attribute_name="riskhubBusinessRole",
        ad_emulator_base_url="http://ad-emulator.local",
    )
    async with client_factory(user=test_user_platform_admin, settings=settings) as ac:
        yield ac


@pytest_asyncio.fixture
async def directory_import_client_business_role_disabled(
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
            email="Imported.User@Example.com",
            user_principal_name="Imported.User@Example.com",
            department="Enterprise Risk",
            job_title="Senior Risk Analyst",
            business_role="Regional Director",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client.post("/api/v1/directory/users/oid-import-create/import", json={})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "created"
    assert payload["external_id"] == "oid-import-create"

    user = (await db_session.execute(select(User).where(User.external_id == "oid-import-create"))).scalar_one()
    assert user.email == "imported.user@example.com"
    assert user.job_title == "Senior Risk Analyst"
    assert user.entra_business_role == "Regional Director"
    assert user.directory_sync_status == "active"

    department = (await db_session.execute(select(Department).where(Department.id == user.department_id))).scalar_one()
    assert department.name == "Enterprise Risk"


@pytest.mark.asyncio
async def test_directory_reimport_updates_existing_user_without_duplication(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    monkeypatch,
):
    test_user_employee.external_id = "oid-existing-import"
    original_department_id = test_user_employee.department_id
    db_session.add(test_user_employee)
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Employee Updated",
            email=test_user_employee.email.upper(),
            user_principal_name=test_user_employee.email.upper(),
            department="Updated Department",
            job_title="Updated Title",
            business_role="Claims Manager",
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

    users = (await db_session.execute(select(User).where(User.email == test_user_employee.email))).scalars().all()
    assert len(users) == 1
    assert users[0].name == "Employee Updated"
    assert users[0].job_title == "Updated Title"
    assert users[0].entra_business_role == "Claims Manager"
    assert users[0].department_id == original_department_id


@pytest.mark.asyncio
async def test_directory_import_preserves_email_matched_user_department(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    monkeypatch,
):
    original_department_id = test_user_employee.department_id
    assert original_department_id is not None
    test_user_employee.external_id = None
    db_session.add(test_user_employee)
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        assert external_id == "oid-email-match"
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Email Matched User",
            email=test_user_employee.email.upper(),
            user_principal_name=test_user_employee.email.upper(),
            department="Directory Should Not Win",
            job_title="Directory Title",
            business_role="Directory Role",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client.post("/api/v1/directory/users/oid-email-match/import", json={})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "updated"

    refreshed = (await db_session.execute(select(User).where(User.id == test_user_employee.id))).scalar_one()
    assert refreshed.external_id == "oid-email-match"
    assert refreshed.department_id == original_department_id


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
    assert response.status_code == 409, response.text
    assert "identity conflict" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_directory_import_external_id_race_returns_conflict(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    monkeypatch,
):
    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Racing Identity",
            email="racing.identity@example.com",
            user_principal_name="racing.identity@example.com",
            department="Risk",
            job_title="Analyst",
            account_enabled=True,
            source="ad_emulator",
        )

    async def race_external_id_insert(
        db,
        *,
        user,
        directory_user,
        sync_business_role,
        seed_department,
    ):
        db.add(
            User(
                email="external-id-race-winner@example.com",
                name="External ID Race Winner",
                external_id=directory_user.external_id,
                hashed_password=None,
                role_id=user.role_id,
                is_active=True,
            )
        )
        await db.flush()

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)
    monkeypatch.setattr(
        "app.services._identity_access_lifecycle.directory_import.apply_directory_profile",
        race_external_id_insert,
    )

    response = await directory_import_client.post("/api/v1/directory/users/oid-race/import", json={})

    assert response.status_code == 409, response.text
    assert "external_id" in response.json()["detail"]


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


@pytest.mark.asyncio
async def test_directory_import_requires_admin(client_cro: AsyncClient):
    response = await client_cro.post("/api/v1/directory/users/oid-import-create/import", json={})
    assert response.status_code == 403
    assert response.json()["detail"] == "Directory access requires Admin"


@pytest.mark.asyncio
async def test_directory_import_clears_entra_business_role_when_directory_value_missing(
    directory_import_client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    monkeypatch,
):
    test_user_employee.external_id = "oid-role-clear"
    test_user_employee.entra_business_role = "Old Role"
    db_session.add(test_user_employee)
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Employee Updated",
            email=test_user_employee.email,
            user_principal_name=test_user_employee.email,
            department="Risk",
            job_title="Analyst",
            business_role=None,
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client.post("/api/v1/directory/users/oid-role-clear/import", json={})
    assert response.status_code == 200, response.text

    refreshed_user = (await db_session.execute(select(User).where(User.external_id == "oid-role-clear"))).scalar_one()
    assert refreshed_user.entra_business_role is None
    assert refreshed_user.entra_business_role_last_synced_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("directory_business_role", [None, "Regional Director"])
async def test_directory_import_does_not_sync_entra_business_role_when_feature_disabled(
    directory_import_client_business_role_disabled: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    monkeypatch,
    directory_business_role: str | None,
):
    test_user_employee.external_id = "oid-role-disabled"
    test_user_employee.entra_business_role = "Old Role"
    db_session.add(test_user_employee)
    await db_session.commit()
    original_synced_at = test_user_employee.entra_business_role_last_synced_at

    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Employee Updated",
            email=test_user_employee.email,
            user_principal_name=test_user_employee.email,
            department="Risk",
            job_title="Analyst",
            business_role=directory_business_role,
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    response = await directory_import_client_business_role_disabled.post(
        "/api/v1/directory/users/oid-role-disabled/import",
        json={},
    )
    assert response.status_code == 200, response.text

    refreshed_user = (
        await db_session.execute(select(User).where(User.external_id == "oid-role-disabled"))
    ).scalar_one()
    assert refreshed_user.entra_business_role == "Old Role"
    assert refreshed_user.entra_business_role_last_synced_at == original_synced_at
