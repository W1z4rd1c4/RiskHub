"""#196 public lifecycle evidence; no new eligibility or administration policy."""

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.core.security import get_password_hash
from app.models import RefreshToken, User
from app.models.activity_log import ActivityEntityType, ActivityLog
from app.models.user import AccessScope
from app.schemas.directory import DirectoryUserRead
from app.services.directory_provider_service import DirectoryProviderService

PASSWORD = "Lifecycle acceptance password 196"


def settings(**changes):
    return Settings(
        debug=True, mock_auth_enabled=True, cors_origins=["http://test"], refresh_token_migration_grace=False, **changes
    )


def directory_record(user, enabled):
    return DirectoryUserRead(
        external_id=user.external_id,
        display_name=user.name,
        email=user.email,
        user_principal_name=user.email,
        account_enabled=enabled,
        source="graph",
    )


@pytest.mark.asyncio
async def test_first_red_suspension_survives_directory_disable_reenable(
    db_session, client_factory, test_user, test_user_employee, monkeypatch
):
    target = test_user_employee
    target.external_id = "196-directory-target"
    await db_session.commit()
    monkeypatch.setattr(
        DirectoryProviderService,
        "get_user",
        AsyncMock(side_effect=[directory_record(target, False), directory_record(target, True)]),
    )
    async with client_factory(user=test_user, settings=settings(auth_mode="microsoft_sso")) as client:
        suspended = await client.patch(f"/api/v1/users/{target.id}", json={"is_active": False})
        assert suspended.status_code == 200, suspended.text
        await db_session.refresh(target)
        assert target.is_active is False
        for _ in range(2):
            result = await client.post(f"/api/v1/admin/directory/check-user/{target.id}")
            assert result.status_code == 200, result.text
        await db_session.refresh(target)
        assert target.directory_sync_status == "active"
        assert target.is_active is False, "Healthy directory sync must not undo the committed manual suspension"


async def retained_credentials(client_factory, target):
    async with client_factory(settings=settings(auth_mode="password")) as client:
        login = await client.post(
            "/api/v1/auth/login", json={"email": target.email, "password": PASSWORD}, headers={"Origin": "http://test"}
        )
        assert login.status_code == 200, login.text
        bearer = login.json()["access_token"]
        csrf = client.cookies["riskhub_csrf_token"]
        cookies = f"riskhub_refresh_token={client.cookies['riskhub_refresh_token']}; riskhub_csrf_token={csrf}"
        me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})
        assert me.status_code == 200 and me.json()["id"] == target.id
        return bearer, {"Origin": "http://test", "X-CSRF-Token": csrf, "Cookie": cookies}


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
async def test_first_red_last_admin_with_cro_denies_without_authority_effects(
    db_session, client_factory, test_user, test_user_cro, adapter
):
    target = test_user
    target.hashed_password = get_password_hash(PASSWORD)
    actor = User(
        name="Scoped lifecycle operator",
        email="scoped-196@example.com",
        role_id=target.role_id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(actor)
    await db_session.commit()
    bearer, refresh_headers = await retained_credentials(client_factory, target)
    version = target.token_version
    refresh_rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == target.id))).all())
    assert len(refresh_rows) == 1 and refresh_rows[0].revoked_at is None
    before_audits = await db_session.scalar(select(func.count()).select_from(ActivityLog))
    async with client_factory(user=actor, settings=settings(auth_mode="microsoft_sso")) as client:
        denied = await client.patch(f"/api/v1/{adapter}/{target.id}", json={"is_active": False})
        # The generic adapter admits the scoped platform Admin and reaches the
        # last-admin guard. Access management has an additional GLOBAL read gate.
        assert denied.status_code == (409 if adapter == "users" else 403), denied.text
    await db_session.refresh(target)
    await db_session.refresh(refresh_rows[0])
    assert target.is_active and target.token_version == version
    assert refresh_rows[0].revoked_at is None
    assert await db_session.scalar(select(func.count()).select_from(ActivityLog)) == before_audits
    async with client_factory(settings=settings(auth_mode="password")) as client:
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})).status_code == 200
        assert (await client.post("/api/v1/auth/refresh", headers=refresh_headers)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("upstream", ["disabled", "missing"])
@pytest.mark.parametrize("system_actor", [False, True])
@pytest.mark.parametrize("remaining_admin", [False, True])
async def test_last_entra_admin_upstream_revocation_records_incident_without_fallback(
    db_session, client_factory, test_user, test_user_cro, monkeypatch, upstream, system_actor, remaining_admin
):
    from types import SimpleNamespace

    from app.core import activity_logger
    from app.services.ad_deprovision_service import ADDeprovisionService
    from app.services.directory_provider_service import DirectoryUserNotFoundError

    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    target = test_user
    target.name = "Private directory identity 196"
    target.external_id = "196-last-entra-admin"
    target.hashed_password = get_password_hash(PASSWORD)
    auditor = User(
        name="Authorized operator",
        email="operator-196@example.com",
        role_id=target.role_id,
        access_scope=AccessScope.GLOBAL if remaining_admin else AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(auditor)
    await db_session.commit()
    target_id, role_id, original_hash = target.id, target.role_id, target.hashed_password
    private_name, private_email = target.name, target.email
    # Real authority is issued by the supported debug password test seam; the
    # mutation uses Entra settings. External token verification is not under test.
    bearer, refresh_headers = await retained_credentials(client_factory, target)
    before_version = target.token_version
    user_count = await db_session.scalar(select(func.count()).select_from(User))
    rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == target_id))).all())
    assert len(rows) == 1 and rows[0].revoked_at is None
    before_audits = await db_session.scalar(
        select(func.count())
        .select_from(ActivityLog)
        .where(ActivityLog.entity_type == ActivityEntityType.USER, ActivityLog.entity_id == target_id)
    )
    provider = AsyncMock(return_value=directory_record(target, False))
    if upstream == "missing":
        provider = AsyncMock(side_effect=DirectoryUserNotFoundError("Private provider incident narrative 196"))
    monkeypatch.setattr(DirectoryProviderService, "get_user", provider)
    deployment = settings(auth_mode="microsoft_sso")
    if system_actor:
        result = await ADDeprovisionService.check_user_by_id(
            db_session, settings=deployment, user_id=target_id, trigger="scheduled-test"
        )
        assert result["status"] == "deprovisioned"
    else:
        async with client_factory(user=auditor, settings=deployment) as client:
            result = await client.post(f"/api/v1/admin/directory/check-user/{target_id}")
            assert result.status_code == 200, result.text
            assert result.json()["status"] == "deprovisioned"
    await db_session.refresh(target)
    await db_session.refresh(rows[0])
    assert not target.is_active and target.token_version == before_version + 1
    assert rows[0].revoked_at is not None
    assert target.id == target_id and target.role_id == role_id and target.hashed_password == original_hash
    assert target.external_id == "196-last-entra-admin"
    assert await db_session.scalar(select(func.count()).select_from(User)) == user_count
    audits = list(
        (
            await db_session.scalars(
                select(ActivityLog).where(
                    ActivityLog.entity_type == ActivityEntityType.USER, ActivityLog.entity_id == target_id
                )
            )
        ).all()
    )
    incidents = [row for row in audits if row.changes and row.changes.get("event_type") == "platform_admin_unavailable"]
    expected_count = 0 if remaining_admin else 1
    assert len(incidents) == expected_count
    # Existing transition + optional pre-existing incident: no duplicate audit added.
    assert len(audits) == before_audits + 1 + expected_count
    message = "Platform administrator unavailable after upstream revocation; operator recovery required"
    async with client_factory(user=auditor, settings=deployment) as client:
        public = await client.get("/api/v1/admin/logs", params={"event_type": "update"})
        assert public.status_code == 200, public.text
    public_incidents = [row for row in public.json() if row["description"] == message]
    siem = [
        row
        for row in emitted
        if row["entity_id"] == target_id
        and (row.get("changes") or {}).get("event_type") == "platform_admin_unavailable"
    ]
    assert len(public_incidents) == len(siem) == expected_count
    if incidents:
        assert incidents[0].description == siem[0]["description"] == message
        assert incidents[0].actor_id == (None if system_actor else auditor.id)
        assert incidents[0].changes == siem[0]["changes"] == {"event_type": "platform_admin_unavailable"}
        assert public_incidents[0]["id"] == incidents[0].id
    transitions = [row for row in audits if row.changes and row.changes.get("event_type") == "directory_deprovisioned"]
    assert len(transitions) == 1 and transitions[0].changes["revoke_count"] == 1
    wire = str([public.json(), siem])
    for secret in [
        private_name,
        private_email,
        original_hash,
        PASSWORD,
        bearer,
        refresh_headers["Cookie"],
        "Private provider incident narrative 196",
    ]:
        assert secret not in wire
    async with client_factory(settings=deployment) as client:
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})).status_code == 401
        assert (await client.post("/api/v1/auth/refresh", headers=refresh_headers)).status_code == 401
