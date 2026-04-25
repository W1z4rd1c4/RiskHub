from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import RefreshToken, User


def _active_refresh_row(*, user_id: int, jti: str) -> RefreshToken:
    now = utc_now()
    return RefreshToken(
        user_id=user_id,
        jti=jti,
        token_version=0,
        issued_at=now - timedelta(minutes=5),
        last_used_at=now - timedelta(minutes=1),
        expires_at=now + timedelta(days=7),
        created_ip="127.0.0.1",
        user_agent="pytest",
    )


@pytest.mark.asyncio
async def test_admin_sessions_lists_real_refresh_sessions(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
):
    db_session.add_all(
        [
            _active_refresh_row(user_id=test_user_employee.id, jti="jti-session-1"),
            _active_refresh_row(user_id=test_user_employee.id, jti="jti-session-2"),
        ]
    )
    await db_session.commit()

    response = await client_platform_admin.get("/api/v1/admin/sessions")
    assert response.status_code == 200, response.text
    payload = response.json()
    target = next(item for item in payload if item["user_id"] == test_user_employee.id)
    assert target["active_sessions"] == 2
    assert target["is_active"] is True
    assert target["user_email"] == test_user_employee.email


@pytest.mark.asyncio
async def test_admin_sessions_excludes_inactive_users(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
):
    test_user_employee.is_active = False
    db_session.add(test_user_employee)
    db_session.add(_active_refresh_row(user_id=test_user_employee.id, jti="jti-inactive-session"))
    await db_session.commit()

    response = await client_platform_admin.get("/api/v1/admin/sessions")
    assert response.status_code == 200, response.text
    assert test_user_employee.id not in {item["user_id"] for item in response.json()}


@pytest.mark.asyncio
async def test_admin_revoke_session_revokes_refresh_rows_and_bumps_token_version(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
):
    test_user_employee.token_version = 3
    db_session.add(test_user_employee)
    db_session.add(_active_refresh_row(user_id=test_user_employee.id, jti="jti-revoke-1"))
    await db_session.commit()

    response = await client_platform_admin.post(f"/api/v1/admin/sessions/{test_user_employee.id}/revoke")
    assert response.status_code == 200, response.text

    refreshed_user = (await db_session.execute(select(User).where(User.id == test_user_employee.id))).scalar_one()
    assert refreshed_user.token_version == 4

    refresh_rows = (
        (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == test_user_employee.id)))
        .scalars()
        .all()
    )
    assert len(refresh_rows) == 1
    assert refresh_rows[0].revoked_at is not None


@pytest.mark.asyncio
async def test_admin_revoke_session_blocks_self_revoke(
    client_platform_admin: AsyncClient,
    test_user_platform_admin: User,
):
    response = await client_platform_admin.post(f"/api/v1/admin/sessions/{test_user_platform_admin.id}/revoke")

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot revoke your own session"
