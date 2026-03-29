from __future__ import annotations

import asyncio
from http.cookies import SimpleCookie

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.main import app
from app.models import RefreshToken, User
from app.services.sso_token_service import VerifiedIdentity


def _refresh_cookie_headers(token: str) -> dict[str, str]:
    return {"Cookie": f"riskhub_refresh_token={token}"}


def _extract_refresh_cookie(response) -> str | None:
    cookie_header = response.headers.get("set-cookie")
    if not cookie_header:
        return None
    parsed = SimpleCookie()
    parsed.load(cookie_header)
    token = parsed.get("riskhub_refresh_token")
    return token.value if token else None


def _extract_refresh_hint_cookie(response) -> str | None:
    cookie_header = response.headers.get("set-cookie")
    if not cookie_header:
        return None
    parsed = SimpleCookie()
    parsed.load(cookie_header)
    hint = parsed.get("riskhub_refresh_hint")
    return hint.value if hint else None


@pytest_asyncio.fixture
async def refresh_client(db_session: AsyncSession) -> AsyncClient:
    async def override_get_db():
        yield db_session

    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            directory_provider="ad_emulator",
            ad_emulator_base_url="http://ad-emulator.local",
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_refresh_endpoint_rotates_refresh_token(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-1"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-1",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200, login.text
    first_cookie = refresh_client.cookies.get("riskhub_refresh_token")
    assert first_cookie
    assert refresh_client.cookies.get("riskhub_refresh_hint") == "1"

    refresh = await refresh_client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 200, refresh.text
    second_cookie = refresh_client.cookies.get("riskhub_refresh_token")
    assert second_cookie
    assert second_cookie != first_cookie

    rows = (
        await db_session.execute(
            select(RefreshToken).where(RefreshToken.user_id == test_user.id).order_by(RefreshToken.id.asc())
        )
    ).scalars().all()
    assert len(rows) == 2
    assert rows[0].revoked_at is not None
    assert rows[1].revoked_at is None


@pytest.mark.asyncio
async def test_refresh_endpoint_blocks_parallel_replay_to_single_winner(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-race"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-race",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200, login.text
    initial_cookie = refresh_client.cookies.get("riskhub_refresh_token")
    assert initial_cookie

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client_a, AsyncClient(
        transport=transport, base_url="http://test"
    ) as client_b:
        response_a, response_b = await asyncio.gather(
            client_a.post("/api/v1/auth/refresh", headers=_refresh_cookie_headers(initial_cookie)),
            client_b.post("/api/v1/auth/refresh", headers=_refresh_cookie_headers(initial_cookie)),
        )

    responses = [response_a, response_b]
    assert sorted(response.status_code for response in responses) == [200, 401]

    winner = next(response for response in responses if response.status_code == 200)
    winner_cookie = _extract_refresh_cookie(winner)
    assert winner_cookie and winner_cookie != initial_cookie

    async with AsyncClient(transport=transport, base_url="http://test") as verifier:
        stale_replay = await verifier.post("/api/v1/auth/refresh", headers=_refresh_cookie_headers(initial_cookie))
        assert stale_replay.status_code == 401

        winner_replay = await verifier.post("/api/v1/auth/refresh", headers=_refresh_cookie_headers(winner_cookie))
        assert winner_replay.status_code == 200


@pytest.mark.asyncio
async def test_logout_clears_refresh_session(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-logout"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-logout",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200

    logout = await refresh_client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert refresh_client.cookies.get("riskhub_refresh_hint") is None

    refresh = await refresh_client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 401


@pytest.mark.asyncio
async def test_refresh_failure_clears_refresh_hint_cookie(
    refresh_client: AsyncClient,
):
    refresh_client.cookies.set("riskhub_refresh_token", "invalid-token", path="/api/v1/auth")
    refresh_client.cookies.set("riskhub_refresh_hint", "1", path="/")

    refresh = await refresh_client.post("/api/v1/auth/refresh")

    assert refresh.status_code == 401
    assert any(
        "riskhub_refresh_hint=" in header and "Max-Age=0" in header
        for header in refresh.headers.get_list("set-cookie")
    )


@pytest.mark.asyncio
async def test_logout_all_revokes_existing_access_token(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-logout-all"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-logout-all",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200
    access_token = login.json()["access_token"]

    logout_all = await refresh_client.post(
        "/api/v1/auth/logout-all",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_all.status_code == 200, logout_all.text

    me = await refresh_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 401
    assert me.json()["detail"] == "Session revoked"

    refresh = await refresh_client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 401
