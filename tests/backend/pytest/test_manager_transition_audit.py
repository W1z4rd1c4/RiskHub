"""#195 manager cleanup audit shares the caller's transaction and actor."""

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import ActivityLog, RefreshToken, User
from app.schemas.directory import DirectoryUserRead
from app.services.ad_deprovision_service import ADDeprovisionService
from app.services.directory_provider_service import DirectoryProviderService
from tests.backend.pytest.test_identity_foundations import identity_settings
from tests.backend.pytest.test_identity_revocation_acceptance import PASSWORD, login, user_audits


async def seed_subordinates(db, parent, client_factory):
    encoded = get_password_hash(PASSWORD)
    children = [
        User(
            name=f"Subordinate {i}",
            email=f"subordinate-{i}@example.test",
            hashed_password=encoded,
            role_id=parent.role_id,
            department_id=parent.department_id,
            manager_id=parent.id,
            is_active=True,
        )
        for i in (1, 2)
    ]
    db.add_all(children)
    await db.commit()
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    retained = {}
    async with client_factory(settings=settings) as client:
        for count, child in enumerate(children, 1):
            for _ in range(count):
                retained[child.id] = await login(client, child.email)
    return children, retained, settings


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
async def test_manager_deactivation_records_exact_subordinate_counts_actor_and_noop(
    db_session, client_factory, test_user_employee, test_user_platform_admin, adapter
):
    parent = test_user_employee
    children, retained, settings = await seed_subordinates(db_session, parent, client_factory)
    versions = {child.id: child.token_version for child in children}
    async with client_factory(settings=settings) as client:
        headers = {"X-Mock-User-Id": str(test_user_platform_admin.id)}
        response = await client.patch(f"/api/v1/{adapter}/{parent.id}", json={"is_active": False}, headers=headers)
        assert response.status_code == 200, response.text
        for count, child in enumerate(children, 1):
            await db_session.refresh(child)
            assert child.manager_id is None and child.token_version == versions[child.id] + 1
            events = [
                row
                for row in await user_audits(db_session, child.id)
                if (row.changes or {}).get("event_type") == "manager_deactivated"
            ]
            assert len(events) == 1
            assert events[0].actor_id == test_user_platform_admin.id
            assert events[0].changes == {"event_type": "manager_deactivated", "revoke_count": count}
            bearer, refresh = retained[child.id]
            assert (
                await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})
            ).status_code == 401
            assert (await client.post("/api/v1/auth/refresh", headers=refresh)).status_code == 401
        counts = {child.id: len(await user_audits(db_session, child.id)) for child in children}
        repeat = await client.patch(f"/api/v1/{adapter}/{parent.id}", json={"is_active": False}, headers=headers)
        assert repeat.status_code == 200, repeat.text
        for child in children:
            await db_session.refresh(child)
            assert child.token_version == versions[child.id] + 1
            assert len(await user_audits(db_session, child.id)) == counts[child.id]


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
async def test_parent_commit_failure_rolls_back_subordinate_cleanup_and_audit(
    db_session, async_engine, client_factory, test_user_employee, test_user_platform_admin, monkeypatch, adapter
):
    parent = test_user_employee
    children, retained, settings = await seed_subordinates(db_session, parent, client_factory)
    parent_id = parent.id
    baseline = {child.id: (child.token_version, len(await user_audits(db_session, child.id))) for child in children}
    observed = []

    async def fail_commit():
        await db_session.flush()
        for count, child in enumerate(children, 1):
            assert child.manager_id is None and child.token_version == baseline[child.id][0] + 1
            records = (
                await db_session.execute(
                    select(ActivityLog.id, ActivityLog.changes).where(
                        ActivityLog.entity_type == "user", ActivityLog.entity_id == child.id
                    )
                )
            ).all()
            events = [row for row in records if (row.changes or {}).get("event_type") == "manager_deactivated"]
            assert len(events) == 1 and events[0].changes["revoke_count"] == count
        observed.append(True)
        raise RuntimeError("parent commit failed after subordinate audits")

    async with client_factory(settings=settings, raise_app_exceptions=False) as client:
        with monkeypatch.context() as patch:
            patch.setattr(db_session, "commit", fail_commit)
            response = await client.patch(
                f"/api/v1/{adapter}/{parent_id}",
                json={"is_active": False},
                headers={"X-Mock-User-Id": str(test_user_platform_admin.id)},
            )
        assert response.status_code == 500
        assert observed == [True]
        async with AsyncSession(async_engine) as observer:
            assert (await observer.get(User, parent_id)).is_active
            for identity, (version, audits) in baseline.items():
                stored = await observer.get(User, identity)
                assert stored.manager_id == parent_id and stored.token_version == version
                rows = list(
                    (await observer.scalars(select(RefreshToken).where(RefreshToken.user_id == identity))).all()
                )
                assert rows and all(row.revoked_at is None for row in rows)
                assert len(await user_audits(observer, identity)) == audits
        for bearer, refresh in retained.values():
            assert (
                await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})
            ).status_code == 200
            assert (await client.post("/api/v1/auth/refresh", headers=refresh)).status_code == 200


@pytest.mark.asyncio
async def test_automated_directory_cleanup_preserves_none_actor_without_subordinate_repeat(
    db_session, client_factory, test_user_employee, monkeypatch
):
    parent = test_user_employee
    parent.external_id = "11111111-0000-4000-8000-000000000197"
    children, _, settings = await seed_subordinates(db_session, parent, client_factory)
    monkeypatch.setattr(
        DirectoryProviderService,
        "get_user",
        AsyncMock(
            return_value=DirectoryUserRead(
                external_id=parent.external_id,
                display_name=parent.name,
                email=parent.email,
                user_principal_name=parent.email,
                account_enabled=False,
                source="graph",
            )
        ),
    )
    for _ in range(2):
        result = await ADDeprovisionService.check_user_by_id(
            db_session, user_id=parent.id, settings=settings, actor=None, trigger="scheduled_check"
        )
        assert result["status"] == "deprovisioned"
    for count, child in enumerate(children, 1):
        events = [
            row
            for row in await user_audits(db_session, child.id)
            if (row.changes or {}).get("event_type") == "manager_deactivated"
        ]
        assert len(events) == 1
        assert events[0].actor_id is None
        assert events[0].changes["revoke_count"] == count
