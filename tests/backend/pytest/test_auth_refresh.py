from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps as api_deps
from app.core.config import Settings, get_settings
from app.core.security import create_access_token
from app.core.tokens import create_refresh_token
from app.db.session import get_db
from app.main import app
from app.middleware.logging_context import _extract_user_id_from_token
from app.models import RefreshToken, User
from app.services.sso_token_service import VerifiedIdentity

TEST_SECRET_KEY = "test-secret-key-32-chars-minimum-value"
TEST_ORIGIN = "http://test"


def _refresh_cookie_headers(token: str, csrf_token: str, *, include_csrf_header: bool = True) -> dict[str, str]:
    headers = {
        "Cookie": f"riskhub_refresh_token={token}; riskhub_csrf_token={csrf_token}; riskhub_refresh_hint=1",
        "Origin": TEST_ORIGIN,
    }
    if include_csrf_header:
        headers["X-CSRF-Token"] = csrf_token
    return headers


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
async def refresh_client(db_session: AsyncSession) -> AsyncClient:
    async def override_get_db():
        yield db_session

    def override_settings():
        return Settings(
            debug=True,
            secret_key=TEST_SECRET_KEY,
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            cors_origins=[TEST_ORIGIN],
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
    assert refresh_client.cookies.get("riskhub_csrf_token")

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )
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
    csrf_token = refresh_client.cookies.get("riskhub_csrf_token")
    assert initial_cookie
    assert csrf_token

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client_a, AsyncClient(
        transport=transport, base_url="http://test"
    ) as client_b:
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
        stale_replay = await verifier.post("/api/v1/auth/refresh", headers=_refresh_cookie_headers(initial_cookie, csrf_token))
        assert stale_replay.status_code == 401

        winner_replay = await verifier.post(
            "/api/v1/auth/refresh",
            headers=_refresh_cookie_headers(winner_cookie, winner_csrf_cookie),
        )
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
    access_token = login.json()["access_token"]

    logout = await refresh_client.post(
        "/api/v1/auth/logout",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )
    assert logout.status_code == 200
    assert refresh_client.cookies.get("riskhub_refresh_hint") is None
    assert refresh_client.cookies.get("riskhub_csrf_token") is None

    me = await refresh_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 401
    assert me.json()["detail"] == "Session revoked"

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": "missing-after-logout"},
    )
    assert refresh.status_code == 403
    assert refresh.json()["code"] == "csrf_validation_failed"


@pytest.mark.asyncio
async def test_csrf_endpoint_issues_cookie(refresh_client: AsyncClient):
    response = await refresh_client.get("/api/v1/auth/csrf")

    assert response.status_code == 204
    assert refresh_client.cookies.get("riskhub_csrf_token")
    assert any(
        "riskhub_csrf_token=" in header and "Path=/" in header
        for header in response.headers.get_list("set-cookie")
    )


@pytest.mark.asyncio
async def test_refresh_rejects_missing_origin(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-missing-origin"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-missing-origin",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )

    assert refresh.status_code == 403
    assert refresh.json()["code"] == "origin_not_allowed"


@pytest.mark.asyncio
async def test_refresh_rejects_missing_csrf_token(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-missing-csrf"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-missing-csrf",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200

    refresh = await refresh_client.post("/api/v1/auth/refresh", headers={"Origin": TEST_ORIGIN})

    assert refresh.status_code == 403
    assert refresh.json()["code"] == "csrf_validation_failed"


@pytest.mark.asyncio
async def test_refresh_rejects_unallowed_origin(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-bad-origin"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-bad-origin",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": "http://evil.example", "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )

    assert refresh.status_code == 403
    assert refresh.json()["code"] == "origin_not_allowed"


@pytest.mark.asyncio
async def test_logout_with_bearer_token_requires_origin_but_not_csrf(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-logout-bearer"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-logout-bearer",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200
    access_token = login.json()["access_token"]

    logout = await refresh_client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}", "Origin": TEST_ORIGIN},
    )
    assert logout.status_code == 200

    me = await refresh_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 401
    assert me.json()["detail"] == "Session revoked"


@pytest.mark.asyncio
async def test_refresh_failure_clears_refresh_hint_cookie(
    refresh_client: AsyncClient,
):
    refresh_client.cookies.set("riskhub_refresh_token", "invalid-token", path="/api/v1/auth")
    refresh_client.cookies.set("riskhub_refresh_hint", "1", path="/")
    refresh_client.cookies.set("riskhub_csrf_token", "csrf-token", path="/")

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": "csrf-token"},
    )

    assert refresh.status_code == 401
    assert any(
        "riskhub_refresh_hint=" in header and "Max-Age=0" in header
        for header in refresh.headers.get_list("set-cookie")
    )
    assert any(
        "riskhub_csrf_token=" in header and "Max-Age=0" in header
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

    refresh = await refresh_client.post("/api/v1/auth/refresh", headers={"Origin": TEST_ORIGIN})
    assert refresh.status_code == 403
    assert refresh.json()["code"] == "csrf_validation_failed"


@pytest.mark.asyncio
async def test_refresh_token_presented_as_bearer_is_rejected(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-bearer"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-bearer",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200, login.text
    refresh_token = refresh_client.cookies.get("riskhub_refresh_token")
    assert refresh_token

    me = await refresh_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh_token}"})
    assert me.status_code == 401
    assert me.json()["detail"] == "Invalid token"


@pytest.mark.asyncio
async def test_rotated_refresh_token_presented_as_bearer_is_rejected(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-rotated-bearer"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-rotated-bearer",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200, login.text
    first_refresh_token = refresh_client.cookies.get("riskhub_refresh_token")
    assert first_refresh_token

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )
    assert refresh.status_code == 200, refresh.text

    me = await refresh_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {first_refresh_token}"})
    assert me.status_code == 401
    assert me.json()["detail"] == "Invalid token"


@pytest.mark.asyncio
async def test_legacy_access_token_without_required_claims_is_rejected_but_refresh_cookie_recovers_session(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    test_user.external_id = "oid-refresh-legacy-access"
    db_session.add(test_user)
    await db_session.commit()

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        return VerifiedIdentity(
            external_id="oid-refresh-legacy-access",
            tenant_id=settings.entra_tenant_id or "",
            email=test_user.email,
            name=test_user.name,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    login = await refresh_client.post("/api/v1/auth/sso/exchange", json={"id_token": "fake"})
    assert login.status_code == 200, login.text

    legacy_access_token = jwt.encode(
        {
            "sub": test_user.email,
            "user_id": test_user.id,
            "token_version": test_user.token_version,
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        TEST_SECRET_KEY,
        algorithm="HS256",
    )

    me = await refresh_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {legacy_access_token}"})
    assert me.status_code == 401
    assert me.json()["detail"] == "Invalid token"

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )
    assert refresh.status_code == 200, refresh.text
    assert refresh.json()["access_token"]


def test_logging_context_ignores_refresh_tokens_for_user_attribution() -> None:
    settings = Settings(secret_key=TEST_SECRET_KEY)
    refresh_token, _ = create_refresh_token(user_id=321, token_version=2, jti="log-refresh-jti", settings=settings)

    assert _extract_user_id_from_token(refresh_token, settings=settings) is None


@pytest.mark.asyncio
async def test_get_current_user_optional_returns_none_for_revoked_token_version(
    db_session: AsyncSession,
    test_user: User,
):
    settings = Settings(secret_key=TEST_SECRET_KEY)
    access_token = create_access_token(
        {"sub": test_user.email, "user_id": test_user.id, "token_version": test_user.token_version},
        settings=settings,
    )

    test_user.token_version += 1
    db_session.add(test_user)
    await db_session.commit()

    optional_user = await api_deps.get_current_user_optional(
        authorization=f"Bearer {access_token}",
        db=db_session,
        settings=settings,
    )

    assert optional_user is None


@pytest.mark.asyncio
async def test_get_current_user_optional_returns_none_for_inactive_user(
    db_session: AsyncSession,
    test_user: User,
):
    settings = Settings(secret_key=TEST_SECRET_KEY)
    access_token = create_access_token(
        {"sub": test_user.email, "user_id": test_user.id, "token_version": test_user.token_version},
        settings=settings,
    )

    test_user.is_active = False
    db_session.add(test_user)
    await db_session.commit()

    optional_user = await api_deps.get_current_user_optional(
        authorization=f"Bearer {access_token}",
        db=db_session,
        settings=settings,
    )

    assert optional_user is None
