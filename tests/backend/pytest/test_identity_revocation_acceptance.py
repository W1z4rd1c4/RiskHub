"""Public #195 acceptance: authority cannot revive; failed commits revoke nothing."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import RefreshToken, Risk, User
from app.models.activity_log import ActivityEntityType, ActivityLog
from tests.backend.pytest.test_identity_foundations import identity_settings

PASSWORD = "Acceptance account password 195"


async def login(client, email):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"Origin": "http://test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"], {
        "Origin": "http://test",
        "X-CSRF-Token": client.cookies["riskhub_csrf_token"],
        "Cookie": f"riskhub_refresh_token={client.cookies['riskhub_refresh_token']}; "
        f"riskhub_csrf_token={client.cookies['riskhub_csrf_token']}",
    }


async def user_audits(db, user_id):
    return list(
        (
            await db.scalars(
                select(ActivityLog)
                .where(
                    ActivityLog.entity_type == ActivityEntityType.USER,
                    ActivityLog.entity_id == user_id,
                )
                .order_by(ActivityLog.id)
            )
        ).all()
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
async def test_reactivation_never_restores_refresh_and_noop_does_not_revoke_again(
    db_session,
    client_factory,
    test_user,
    test_user_employee,
    test_risk,
    adapter,
):
    employee = test_user_employee
    employee.hashed_password = get_password_hash(PASSWORD)
    test_risk.owner_id = employee.id
    await db_session.commit()
    user_id, admin_id, risk_id, email = employee.id, test_user.id, test_risk.id, employee.email
    version = employee.token_version
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    async with client_factory(settings=settings) as client:
        bearer, refresh_headers = await login(client, email)
        old_rows = list(
            (
                await db_session.scalars(
                    select(RefreshToken).where(
                        RefreshToken.user_id == user_id,
                    )
                )
            ).all()
        )
        assert len(old_rows) == 1 and old_rows[0].revoked_at is None
        for active in (False, True):
            before = len(await user_audits(db_session, user_id))
            response = await client.patch(
                f"/api/v1/{adapter}/{user_id}", json={"is_active": active}, headers={"X-Mock-User-Id": str(admin_id)}
            )
            assert response.status_code == 200, response.text
            await db_session.refresh(employee)
            assert employee.token_version == version + 1
            version = employee.token_version
            audits = await user_audits(db_session, user_id)
            assert len(audits) == before + 1
            # This slice pins transactional presence/count, not the separately
            # tracked current redaction of session-authority audit metadata.
            assert "session_authority" in audits[-1].changes
            assert audits[-1].actor_id == admin_id
            repeated = await client.patch(
                f"/api/v1/{adapter}/{user_id}", json={"is_active": active}, headers={"X-Mock-User-Id": str(admin_id)}
            )
            assert repeated.status_code == 200, repeated.text
            await db_session.refresh(employee)
            assert employee.token_version == version
            assert len(await user_audits(db_session, user_id)) == len(audits)
        # Denial is checked only after reactivation, not merely while inactive.
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})).status_code == 401
        assert (await client.post("/api/v1/auth/refresh", headers=refresh_headers)).status_code == 401
        await db_session.refresh(old_rows[0])
        assert old_rows[0].revoked_at is not None
        assert old_rows[0].revoked_reason == "identity_access_changed"
        await db_session.refresh(test_risk)
        assert test_risk.id == risk_id and test_risk.owner_id == user_id
        new_bearer, _ = await login(client, email)
        assert (
            await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_bearer}"})
        ).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
async def test_failed_transition_commit_rolls_back_authority_refresh_and_audit(
    db_session,
    async_engine,
    client_factory,
    test_user,
    test_user_employee,
    test_risk,
    adapter,
    monkeypatch,
):
    employee = test_user_employee
    employee.hashed_password = get_password_hash(PASSWORD)
    test_risk.owner_id = employee.id
    await db_session.commit()
    user_id, admin_id, risk_id, email = employee.id, test_user.id, test_risk.id, employee.email
    version = employee.token_version
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    async with client_factory(settings=settings, raise_app_exceptions=False) as client:
        bearer, refresh_headers = await login(client, email)
        audit_count = len(await user_audits(db_session, user_id))
        seen = []

        async def failed_commit():
            # Exercise the real service boundary's rollback handler, after real
            # invalidation and audit have been flushed, not fixture cleanup.
            await db_session.flush()
            rows = list(
                (
                    await db_session.scalars(
                        select(RefreshToken).where(
                            RefreshToken.user_id == user_id,
                        )
                    )
                ).all()
            )
            assert employee.token_version == version + 1
            assert len(rows) == 1 and rows[0].revoked_at is not None
            audits = (
                await db_session.execute(
                    select(ActivityLog.id, ActivityLog.changes)
                    .where(
                        ActivityLog.entity_type == ActivityEntityType.USER,
                        ActivityLog.entity_id == user_id,
                    )
                    .order_by(ActivityLog.id)
                )
            ).all()
            assert len(audits) == audit_count + 1
            assert "session_authority" in audits[-1].changes
            assert audits[-1].changes["event_type"] == {"old": None, "new": "identity_access_changed"}
            assert audits[-1].changes["revoke_count"] == {"old": None, "new": 1}
            seen.append(True)
            raise RuntimeError("injected account transition commit failure")

        with monkeypatch.context() as patch:
            patch.setattr(db_session, "commit", failed_commit)
            response = await client.patch(
                f"/api/v1/{adapter}/{user_id}", json={"is_active": False}, headers={"X-Mock-User-Id": str(admin_id)}
            )
        assert response.status_code == 500
        assert seen == [True]
        # Fresh persistence view; no explicit test rollback is allowed here.
        async with AsyncSession(async_engine) as observer:
            stored = await observer.get(User, user_id)
            assert stored.token_version == version and stored.is_active is True
            assert stored.local_suspended is False
            rows = list(
                (
                    await observer.scalars(
                        select(RefreshToken).where(
                            RefreshToken.user_id == user_id,
                        )
                    )
                ).all()
            )
            assert len(rows) == 1 and rows[0].revoked_at is None
            assert rows[0].revoked_reason is None
            assert len(await user_audits(observer, user_id)) == audit_count
            assert (await observer.get(Risk, risk_id)).owner_id == user_id
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})).status_code == 200
        assert (await client.post("/api/v1/auth/refresh", headers=refresh_headers)).status_code == 200
