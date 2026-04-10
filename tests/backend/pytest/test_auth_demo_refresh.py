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

TEST_ORIGIN = "http://test"


def _refresh_cookie_headers(token: str, csrf_token: str) -> dict[str, str]:
    return {
        "Cookie": f"riskhub_refresh_token={token}; riskhub_csrf_token={csrf_token}; riskhub_refresh_hint=1",
        "Origin": TEST_ORIGIN,
        "X-CSRF-Token": csrf_token,
    }


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


def _extract_csrf_cookie(response) -> str | None:
    for cookie_header in response.headers.get_list("set-cookie"):
        parsed = SimpleCookie()
        parsed.load(cookie_header)
        token = parsed.get("riskhub_csrf_token")
        if token:
            return token.value
    return None


@pytest_asyncio.fixture
async def demo_auth_client(db_session: AsyncSession) -> AsyncClient:
    async def override_get_db():
        yield db_session

    def override_settings():
        return Settings(
            debug=True,
            secret_key="test-secret-key-32-chars-minimum-value",
            mock_auth_enabled=True,
            auth_mode="hybrid_dev",
            cors_origins=[TEST_ORIGIN],
            trusted_proxies=["127.0.0.1", "::1", "10.0.0.0/8"],
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_demo_login_issues_refresh_cookie_and_refreshes_session(
    demo_auth_client: AsyncClient,
    test_user: User,
):
    response = await demo_auth_client.post("/api/v1/auth/demo-login", json={"email": test_user.email})
    assert response.status_code == 200, response.text
    assert demo_auth_client.cookies.get("riskhub_refresh_token")
    assert demo_auth_client.cookies.get("riskhub_refresh_hint") == "1"
    assert demo_auth_client.cookies.get("riskhub_csrf_token")

    refresh = await demo_auth_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(demo_auth_client.cookies.get("riskhub_csrf_token"))},
    )
    assert refresh.status_code == 200, refresh.text


@pytest.mark.asyncio
async def test_demo_refresh_replay_allows_single_parallel_winner(
    demo_auth_client: AsyncClient,
    test_user: User,
):
    login = await demo_auth_client.post("/api/v1/auth/demo-login", json={"email": test_user.email})
    assert login.status_code == 200, login.text
    initial_cookie = demo_auth_client.cookies.get("riskhub_refresh_token")
    csrf_token = demo_auth_client.cookies.get("riskhub_csrf_token")
    assert initial_cookie
    assert csrf_token

    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as client_a,
        AsyncClient(transport=transport, base_url="http://test") as client_b,
    ):
        response_a, response_b = await asyncio.gather(
            client_a.post("/api/v1/auth/refresh", headers=_refresh_cookie_headers(initial_cookie, csrf_token)),
            client_b.post("/api/v1/auth/refresh", headers=_refresh_cookie_headers(initial_cookie, csrf_token)),
        )

    responses = [response_a, response_b]
    assert sorted(response.status_code for response in responses) == [200, 401]

    winner = next(response for response in responses if response.status_code == 200)
    winner_cookie = _extract_refresh_cookie(winner)
    winner_csrf_cookie = _extract_csrf_cookie(winner)
    assert winner_cookie and winner_cookie != initial_cookie
    assert winner_csrf_cookie

    async with AsyncClient(transport=transport, base_url="http://test") as verifier:
        stale_replay = await verifier.post(
            "/api/v1/auth/refresh",
            headers=_refresh_cookie_headers(initial_cookie, csrf_token),
        )
        assert stale_replay.status_code == 401

        winner_replay = await verifier.post(
            "/api/v1/auth/refresh",
            headers=_refresh_cookie_headers(winner_cookie, winner_csrf_cookie),
        )
        assert winner_replay.status_code == 200


@pytest.mark.asyncio
async def test_demo_login_records_refresh_session_ip_using_trusted_proxy_resolution(
    demo_auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    response = await demo_auth_client.post(
        "/api/v1/auth/demo-login",
        json={"email": test_user.email},
        headers={"X-Forwarded-For": "198.51.100.42, 10.0.0.5"},
    )
    assert response.status_code == 200, response.text
    assert _extract_refresh_hint_cookie(response) == "1"

    refresh_row = (
        await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == test_user.id))
    ).scalar_one()
    assert refresh_row.created_ip == "198.51.100.42"
