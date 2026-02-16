from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import Control, OrphanedItem, RefreshToken, Risk, User
from app.schemas.directory import DirectoryUserRead
from app.services.ad_deprovision_service import ADDeprovisionService
from app.services.directory_provider_service import DirectoryUserNotFoundError


def _service_settings() -> Settings:
    return Settings(
        debug=True,
        secret_key="test-secret-key",
        mock_auth_enabled=True,
        directory_provider="ad_emulator",
        ad_emulator_base_url="http://ad-emulator.local",
    )


@pytest.mark.asyncio
async def test_deprovision_missing_user_deactivates_revokes_and_flags_orphans(
    db_session: AsyncSession,
    test_user_employee: User,
    test_department,
    monkeypatch,
):
    test_user_employee.external_id = "oid-missing-user"
    test_user_employee.token_version = 1
    db_session.add(test_user_employee)

    risk = Risk(
        risk_id_code="R-DEPROV-1",
        name="Deprovision Risk",
        process="Deprovision Process",
        description="Owned by user expected to be deprovisioned",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Deprovision Control",
        description="Owned by user expected to be deprovisioned",
        department_id=test_department.id,
        control_owner_id=test_user_employee.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([risk, control])

    db_session.add(
        RefreshToken(
            user_id=test_user_employee.id,
            jti="deprov-jti-1",
            token_version=test_user_employee.token_version,
            issued_at=datetime.now(UTC) - timedelta(minutes=5),
            last_used_at=datetime.now(UTC) - timedelta(minutes=1),
            expires_at=datetime.now(UTC) + timedelta(days=7),
            created_ip="127.0.0.1",
            user_agent="pytest",
        )
    )
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        raise DirectoryUserNotFoundError("missing")

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    result = await ADDeprovisionService.check_user_by_id(
        db_session,
        user_id=test_user_employee.id,
        settings=_service_settings(),
        trigger="pytest",
    )
    assert result["status"] == "deprovisioned"
    assert result["revoked_sessions"] == 1
    assert result["orphaned_items_flagged"] >= 2

    refreshed_user = (await db_session.execute(select(User).where(User.id == test_user_employee.id))).scalar_one()
    assert refreshed_user.is_active is False
    assert refreshed_user.deprovision_reason == ADDeprovisionService.DEPROVISION_REASON
    assert refreshed_user.token_version == 2

    refresh_rows = (
        await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == test_user_employee.id))
    ).scalars().all()
    assert refresh_rows[0].revoked_at is not None

    orphans = (
        await db_session.execute(
            select(OrphanedItem).where(OrphanedItem.previous_owner_id == test_user_employee.id)
        )
    ).scalars().all()
    assert {(item.item_type, item.item_id) for item in orphans} >= {
        ("risk", risk.id),
        ("control", control.id),
    }


@pytest.mark.asyncio
async def test_deprovision_active_user_updates_sync_metadata(
    db_session: AsyncSession,
    test_user_employee: User,
    monkeypatch,
):
    test_user_employee.external_id = "oid-active-user"
    test_user_employee.is_active = True
    db_session.add(test_user_employee)
    await db_session.commit()

    async def stub_get_user(self, external_id: str):
        return DirectoryUserRead(
            external_id=external_id,
            display_name="Employee Active",
            email=test_user_employee.email,
            user_principal_name=test_user_employee.email,
            department="Risk",
            job_title="Analyst",
            account_enabled=True,
            source="ad_emulator",
        )

    monkeypatch.setattr("app.services.directory_provider_service.DirectoryProviderService.get_user", stub_get_user)

    result = await ADDeprovisionService.check_user_by_id(
        db_session,
        user_id=test_user_employee.id,
        settings=_service_settings(),
        trigger="pytest",
    )
    assert result["status"] == "active"

    refreshed_user = (await db_session.execute(select(User).where(User.id == test_user_employee.id))).scalar_one()
    assert refreshed_user.is_active is True
    assert refreshed_user.directory_sync_status == "active"
    assert refreshed_user.directory_last_checked_at is not None
    assert refreshed_user.directory_last_seen_at is not None
