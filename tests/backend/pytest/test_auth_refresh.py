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
from app.api.v1.endpoints.auth._request_protection import validate_request_origin
from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.security import create_access_token
from app.core.tokens import (
    REFRESH_TOKEN_AUDIENCE,
    REFRESH_TOKEN_ISSUER,
    REFRESH_TOKEN_TYPE,
    create_refresh_token,
    decode_refresh_token,
)
from app.main import app
from app.middleware.logging_context import _extract_user_id_from_token
from app.models import ActivityLog, RefreshToken, User
from app.models.activity_log import ActivityAction
from app.services.sso_token_service import VerifiedIdentity

TEST_SECRET_KEY = "test-secret-key-32-chars-minimum-value"
TEST_ORIGIN = "http://test"


def _origin_request(origin: str):
    return type(
        "OriginRequest",
        (),
        {"headers": {"origin": origin}},
    )()


def test_origin_validation_treats_default_http_port_as_equivalent() -> None:
    settings = Settings(cors_origins=["http://localhost:80"])

    assert validate_request_origin(_origin_request("http://localhost"), settings) is None


def _refresh_test_settings() -> Settings:
    return Settings(secret_key=TEST_SECRET_KEY)


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
async def refresh_client(client_factory) -> AsyncClient:
    settings = Settings(
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
    async with client_factory(settings=settings) as ac:
        yield ac


async def _start_sso_challenge(refresh_client: AsyncClient, *, return_to: str = "/") -> dict[str, str | int]:
    response = await refresh_client.post(
        "/api/v1/auth/sso/start",
        json={"return_to": return_to},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _login_via_sso_exchange(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    *,
    external_id: str,
    expires_at: datetime | None = None,
):
    test_user.external_id = external_id
    db_session.add(test_user)
    await db_session.commit()

    challenge = await _start_sso_challenge(refresh_client)

    async def stub_verify_entra_id_token(*, id_token: str, settings: Settings):
        identity_kwargs = {
            "external_id": external_id,
            "tenant_id": settings.entra_tenant_id or "",
            "email": test_user.email,
            "name": test_user.name,
            "nonce": str(challenge["nonce"]),
        }
        if expires_at is not None:
            identity_kwargs["expires_at"] = expires_at
        return VerifiedIdentity(
            **identity_kwargs,
        )

    monkeypatch.setattr("app.api.v1.endpoints.auth.verify_entra_id_token", stub_verify_entra_id_token)

    response = await refresh_client.post(
        "/api/v1/auth/sso/exchange",
        json={"id_token": "fake", "state": challenge["state"]},
    )
    assert response.status_code == 200, response.text
    return response


@pytest.mark.asyncio
async def test_refresh_endpoint_rotates_refresh_token(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-1",
    )
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
        (
            await db_session.execute(
                select(RefreshToken).where(RefreshToken.user_id == test_user.id).order_by(RefreshToken.id.asc())
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    assert rows[0].revoked_at is not None
    assert rows[1].revoked_at is None

    activity = (
        await db_session.execute(
            select(ActivityLog)
            .where(ActivityLog.entity_id == test_user.id)
            .where(ActivityLog.action == ActivityAction.REFRESH.value)
            .order_by(ActivityLog.id.desc())
        )
    ).scalars().first()
    assert activity is not None
    assert activity.changes == {"result": "rotated", "revoke_count": 1, "context_changed": False}


@pytest.mark.asyncio
async def test_refresh_rotation_preserves_absolute_session_expiry_for_sso_sessions(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    absolute_expiry = utc_now() + timedelta(minutes=5)
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-fixed-lifetime",
        expires_at=absolute_expiry,
    )

    first_row = (
        (
            await db_session.execute(
                select(RefreshToken).where(RefreshToken.user_id == test_user.id).order_by(RefreshToken.id.asc())
            )
        )
        .scalars()
        .one()
    )

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )
    assert refresh.status_code == 200, refresh.text

    rows = (
        (
            await db_session.execute(
                select(RefreshToken).where(RefreshToken.user_id == test_user.id).order_by(RefreshToken.id.asc())
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    assert abs((rows[1].expires_at - first_row.expires_at).total_seconds()) < 1.5


@pytest.mark.asyncio
async def test_refresh_rejects_sessions_with_less_than_minimum_remaining_lifetime(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    test_user.external_id = "oid-refresh-expiring"
    db_session.add(test_user)
    await db_session.commit()

    refresh_token, _ = create_refresh_token(
        user_id=test_user.id,
        token_version=test_user.token_version,
        jti="near-expiry-jti",
        settings=Settings(
            debug=True,
            secret_key=TEST_SECRET_KEY,
            mock_auth_enabled=True,
            auth_mode="microsoft_sso",
            cors_origins=[TEST_ORIGIN],
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
            directory_provider="ad_emulator",
            ad_emulator_base_url="http://ad-emulator.local",
        ),
        expires_delta=timedelta(seconds=30),
    )
    now = utc_now()
    refresh_row = RefreshToken(
        user_id=test_user.id,
        jti="near-expiry-jti",
        token_version=test_user.token_version,
        issued_at=now,
        last_used_at=now,
        expires_at=now + timedelta(seconds=30),
        created_ip="127.0.0.1",
        user_agent="pytest",
    )
    db_session.add(refresh_row)
    await db_session.commit()

    response = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers=_refresh_cookie_headers(refresh_token, "short-lived-csrf"),
    )
    assert response.status_code == 401

    refreshed_row = (
        await db_session.execute(select(RefreshToken).where(RefreshToken.id == refresh_row.id))
    ).scalar_one()
    assert refreshed_row.revoked_reason == "expires_soon"


@pytest.mark.asyncio
async def test_refresh_endpoint_revokes_rotated_child_on_stale_replay(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-race",
    )
    initial_cookie = refresh_client.cookies.get("riskhub_refresh_token")
    csrf_token = refresh_client.cookies.get("riskhub_csrf_token")
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
    winner_jti = decode_refresh_token(winner_cookie, _refresh_test_settings())["jti"]

    async with AsyncClient(transport=transport, base_url="http://test") as verifier:
        stale_replay = await verifier.post(
            "/api/v1/auth/refresh", headers=_refresh_cookie_headers(initial_cookie, csrf_token)
        )
        assert stale_replay.status_code == 401

        winner_replay = await verifier.post(
            "/api/v1/auth/refresh",
            headers=_refresh_cookie_headers(winner_cookie, winner_csrf_cookie),
        )
        assert winner_replay.status_code == 401

    child_row = (
        await db_session.execute(
            select(RefreshToken).where(RefreshToken.user_id == test_user.id).where(RefreshToken.jti == winner_jti)
        )
    ).scalar_one()
    assert child_row.revoked_at is not None
    assert child_row.revoked_reason == "replay_detected"


@pytest.mark.asyncio
async def test_logout_clears_refresh_session(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    login = await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-logout",
    )
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

    activity = (
        await db_session.execute(
            select(ActivityLog)
            .where(ActivityLog.entity_id == test_user.id)
            .where(ActivityLog.action == ActivityAction.LOGOUT.value)
            .order_by(ActivityLog.id.desc())
        )
    ).scalars().first()
    assert activity is not None
    assert activity.changes == {"logout_scope": "all_devices", "revoke_count": 1, "result": "revoked"}


@pytest.mark.asyncio
async def test_csrf_endpoint_issues_cookie(refresh_client: AsyncClient):
    response = await refresh_client.get("/api/v1/auth/csrf")

    assert response.status_code == 204
    assert refresh_client.cookies.get("riskhub_csrf_token")
    assert any(
        "riskhub_csrf_token=" in header and "Path=/" in header for header in response.headers.get_list("set-cookie")
    )


@pytest.mark.asyncio
async def test_refresh_rejects_missing_origin(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-missing-origin",
    )

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
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-missing-csrf",
    )

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
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-bad-origin",
    )

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={
            "Origin": "http://evil.example",
            "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token")),
        },
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
    login = await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-logout-bearer",
    )
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
        "riskhub_refresh_hint=" in header and "Max-Age=0" in header for header in refresh.headers.get_list("set-cookie")
    )
    assert any(
        "riskhub_csrf_token=" in header and "Max-Age=0" in header for header in refresh.headers.get_list("set-cookie")
    )


@pytest.mark.asyncio
async def test_refresh_invalid_token_emits_audit_only_without_activity_log(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    from app.core.activity_logger import audit_logger

    emitted: dict[str, object] = {}

    def capture(event: str, **kwargs: object) -> None:
        emitted["event"] = event
        emitted.update(kwargs)

    monkeypatch.setattr(audit_logger, "warning", capture)
    refresh_client.cookies.set("riskhub_refresh_token", "invalid-token", path="/api/v1/auth")
    refresh_client.cookies.set("riskhub_refresh_hint", "1", path="/")
    refresh_client.cookies.set("riskhub_csrf_token", "csrf-token", path="/")

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": "csrf-token"},
    )

    assert refresh.status_code == 401
    assert emitted["event"] == "failed_refresh"
    assert emitted["event_type"] == ActivityAction.FAILED_REFRESH.value
    rows = (await db_session.execute(select(ActivityLog))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_logout_all_revokes_existing_access_token(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    login = await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-logout-all",
    )
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

    activity = (
        await db_session.execute(
            select(ActivityLog)
            .where(ActivityLog.entity_id == test_user.id)
            .where(ActivityLog.action == ActivityAction.LOGOUT_ALL.value)
            .order_by(ActivityLog.id.desc())
        )
    ).scalars().first()
    assert activity is not None
    assert activity.changes == {"logout_scope": "all_devices", "revoke_count": 1, "result": "revoked"}


@pytest.mark.asyncio
async def test_refresh_token_version_mismatch_logs_failed_refresh(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-failed",
    )
    test_user.token_version += 1
    db_session.add(test_user)
    await db_session.commit()

    refresh = await refresh_client.post(
        "/api/v1/auth/refresh",
        headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(refresh_client.cookies.get("riskhub_csrf_token"))},
    )

    assert refresh.status_code == 401
    activity = (
        await db_session.execute(
            select(ActivityLog)
            .where(ActivityLog.entity_id == test_user.id)
            .where(ActivityLog.action == ActivityAction.FAILED_REFRESH.value)
            .order_by(ActivityLog.id.desc())
        )
    ).scalars().first()
    assert activity is not None
    assert activity.changes == {"failure_code": "token_version_mismatch", "revoke_count": 1}


@pytest.mark.asyncio
async def test_refresh_token_presented_as_bearer_is_rejected(
    refresh_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch,
):
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-bearer",
    )
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
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-rotated-bearer",
    )
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
    await _login_via_sso_exchange(
        refresh_client,
        db_session,
        test_user,
        monkeypatch,
        external_id="oid-refresh-legacy-access",
    )

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


# ── Refresh token claim validation ──────────────────────────────────


def test_new_refresh_token_contains_aud_iss_type_claims():
    settings = Settings(secret_key=TEST_SECRET_KEY)
    token, _ = create_refresh_token(
        user_id=1, token_version=1, jti="claims-jti", settings=settings,
    )
    payload = jwt.decode(
        token,
        TEST_SECRET_KEY,
        algorithms=["HS256"],
        audience=REFRESH_TOKEN_AUDIENCE,
        issuer=REFRESH_TOKEN_ISSUER,
    )
    assert payload["aud"] == REFRESH_TOKEN_AUDIENCE
    assert payload["iss"] == REFRESH_TOKEN_ISSUER
    assert payload["type"] == REFRESH_TOKEN_TYPE


def test_decode_refresh_token_rejects_wrong_audience():
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=False)
    wrong_aud_token = jwt.encode(
        {"type": REFRESH_TOKEN_TYPE, "aud": "wrong-audience", "iss": REFRESH_TOKEN_ISSUER,
         "user_id": 1, "token_version": 1, "jti": "bad-aud", "exp": datetime.now(UTC) + timedelta(hours=1)},
        TEST_SECRET_KEY, algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidAudienceError):
        decode_refresh_token(wrong_aud_token, settings)


def test_decode_refresh_token_rejects_wrong_issuer():
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=False)
    wrong_iss_token = jwt.encode(
        {"type": REFRESH_TOKEN_TYPE, "aud": REFRESH_TOKEN_AUDIENCE, "iss": "wrong-issuer",
         "user_id": 1, "token_version": 1, "jti": "bad-iss", "exp": datetime.now(UTC) + timedelta(hours=1)},
        TEST_SECRET_KEY, algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidIssuerError):
        decode_refresh_token(wrong_iss_token, settings)


def test_decode_refresh_token_grace_accepts_legacy_token():
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=True)
    legacy_token = jwt.encode(
        {"type": REFRESH_TOKEN_TYPE, "user_id": 1, "token_version": 1,
         "jti": "legacy-jti", "exp": datetime.now(UTC) + timedelta(hours=1)},
        TEST_SECRET_KEY, algorithm="HS256",
    )
    payload = decode_refresh_token(legacy_token, settings)
    assert payload["type"] == REFRESH_TOKEN_TYPE
    assert payload["user_id"] == 1


def test_decode_refresh_token_grace_rejects_partial_claim_migration():
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=True)
    partial_token = jwt.encode(
        {"type": REFRESH_TOKEN_TYPE, "iss": "wrong-issuer", "user_id": 1, "token_version": 1,
         "jti": "partial-jti", "exp": datetime.now(UTC) + timedelta(hours=1)},
        TEST_SECRET_KEY, algorithm="HS256",
    )
    with pytest.raises(jwt.MissingRequiredClaimError):
        decode_refresh_token(partial_token, settings)


def test_decode_refresh_token_grace_disabled_rejects_legacy_token():
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=False)
    legacy_token = jwt.encode(
        {"type": REFRESH_TOKEN_TYPE, "user_id": 1, "token_version": 1,
         "jti": "legacy-jti", "exp": datetime.now(UTC) + timedelta(hours=1)},
        TEST_SECRET_KEY, algorithm="HS256",
    )
    with pytest.raises(jwt.MissingRequiredClaimError):
        decode_refresh_token(legacy_token, settings)


def test_decode_refresh_token_grace_rejects_token_missing_exp():
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=True)
    token_missing_exp = jwt.encode(
        {"type": REFRESH_TOKEN_TYPE, "user_id": 1, "token_version": 1, "jti": "missing-exp"},
        TEST_SECRET_KEY,
        algorithm="HS256",
    )
    with pytest.raises(jwt.MissingRequiredClaimError):
        decode_refresh_token(token_missing_exp, settings)
