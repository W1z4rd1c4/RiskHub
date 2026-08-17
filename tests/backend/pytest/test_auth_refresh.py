from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta, timezone
from http.cookies import SimpleCookie
from typing import Any

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.api import deps as api_deps
from app.api.v1.endpoints.auth._request_protection import validate_request_origin
from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.security import create_access_token, decode_access_token
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


def _role_aware_refresh_settings() -> Settings:
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
        access_token_expire_minutes=30,
        platform_admin_access_token_expire_minutes=15,
    )


def _independent_db_override(
    async_engine: AsyncEngine,
    *,
    application_names: tuple[str, ...] = (),
) -> Callable[[], AsyncIterator[AsyncSession]]:
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    names = iter(application_names)

    async def independent_db_session() -> AsyncIterator[AsyncSession]:
        async with session_maker() as session:
            application_name = next(names, None)
            if application_name is not None:
                await session.execute(
                    text("SELECT set_config('application_name', :name, true)"),
                    {"name": application_name},
                )
            yield session

    return independent_db_session


async def _wait_for_postgres_lock_queries(
    observer: AsyncSession,
    *,
    application_names: set[str],
    timeout_seconds: float = 5,
) -> dict[str, str]:
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    while asyncio.get_running_loop().time() < deadline:
        await observer.execute(text("SELECT pg_stat_clear_snapshot()"))
        activity_rows = (
            await observer.execute(
                text(
                    "SELECT application_name, query "
                    "FROM pg_stat_activity "
                    "WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'"
                )
            )
        ).mappings()
        waiting_queries = {
            str(row["application_name"]): str(row["query"])
            for row in activity_rows
            if row["application_name"] in application_names
        }
        if waiting_queries.keys() == application_names:
            return waiting_queries
        await asyncio.sleep(0.02)
    raise AssertionError(
        f"Timed out waiting for PostgreSQL lock waits: {sorted(application_names)}"
    )


async def _run_two_refreshes_behind_user_lock(
    *,
    client: AsyncClient,
    user_lock_gate: AsyncSession,
    lock_observer: AsyncSession,
    user_id: int,
    headers: dict[str, str],
    application_names: set[str],
) -> tuple[Response, Response, dict[str, str]]:
    await user_lock_gate.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    refresh_tasks = [
        asyncio.create_task(client.post("/api/v1/auth/refresh", headers=headers))
        for _ in range(2)
    ]
    try:
        waiting_queries = await _wait_for_postgres_lock_queries(
            lock_observer,
            application_names=application_names,
        )
    finally:
        await user_lock_gate.commit()
    response_a, response_b = await asyncio.wait_for(
        asyncio.gather(*refresh_tasks),
        timeout=10,
    )
    return response_a, response_b, waiting_queries


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


async def _refresh_and_decode_access_token(
    client_factory,
    db_session: AsyncSession,
    user: User,
    monkeypatch: pytest.MonkeyPatch,
    *,
    external_id: str,
) -> dict[str, Any]:
    settings = _role_aware_refresh_settings()
    async with client_factory(settings=settings) as client:
        await _login_via_sso_exchange(
            client,
            db_session,
            user,
            monkeypatch,
            external_id=external_id,
        )
        response = await client.post(
            "/api/v1/auth/refresh",
            headers={
                "Origin": TEST_ORIGIN,
                "X-CSRF-Token": str(client.cookies.get("riskhub_csrf_token")),
            },
        )

    assert response.status_code == 200, response.text
    return decode_access_token(response.json()["access_token"], settings=settings)


@pytest.mark.asyncio
async def test_refresh_issues_ordinary_user_access_token_for_30_minutes(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    monkeypatch: pytest.MonkeyPatch,
    frozen_clock,
) -> None:
    claims = await _refresh_and_decode_access_token(
        client_factory,
        db_session,
        test_user_employee,
        monkeypatch,
        external_id="oid-refresh-ordinary-lifetime",
    )

    assert datetime.fromtimestamp(claims["exp"], tz=UTC) == datetime(2026, 5, 7, 12, 30, tzinfo=UTC)


@pytest.mark.asyncio
async def test_refresh_issues_platform_admin_access_token_for_15_minutes(
    client_factory,
    db_session: AsyncSession,
    test_user_platform_admin: User,
    monkeypatch: pytest.MonkeyPatch,
    frozen_clock,
) -> None:
    claims = await _refresh_and_decode_access_token(
        client_factory,
        db_session,
        test_user_platform_admin,
        monkeypatch,
        external_id="oid-refresh-admin-lifetime",
    )

    assert datetime.fromtimestamp(claims["exp"], tz=UTC) == datetime(2026, 5, 7, 12, 15, tzinfo=UTC)


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
@pytest.mark.postgres
async def test_refresh_rotation_preserves_absolute_expiry_after_user_lock_wait_postgres(
    client_factory,
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row locks are required for refresh lock-wait coverage")

    settings = _role_aware_refresh_settings()
    async with client_factory(settings=settings) as setup_client:
        await _login_via_sso_exchange(
            setup_client,
            db_session,
            test_user,
            monkeypatch,
            external_id="oid-refresh-lock-wait-expiry",
        )
        parent_token = setup_client.cookies.get("riskhub_refresh_token")
        parent_csrf = setup_client.cookies.get("riskhub_csrf_token")
        assert parent_token and parent_csrf

    parent_claims = decode_refresh_token(parent_token, settings)
    parent_row = (
        await db_session.execute(
            select(RefreshToken).where(RefreshToken.jti == parent_claims["jti"])
        )
    ).scalar_one()
    parent_expires_at = parent_row.expires_at
    parent_signed_expiry = int(parent_claims["exp"])

    request_name = "riskhub_issue123_refresh_expiry_wait"
    independent_db_session = _independent_db_override(
        async_engine,
        application_names=(request_name,),
    )
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with (
        session_maker() as user_lock_gate,
        session_maker() as lock_observer,
        client_factory(
            settings=settings,
            db_override=independent_db_session,
        ) as concurrent_client,
    ):
        await user_lock_gate.execute(
            select(User).where(User.id == test_user.id).with_for_update()
        )
        refresh_task = asyncio.create_task(
            concurrent_client.post(
                "/api/v1/auth/refresh",
                headers=_refresh_cookie_headers(parent_token, parent_csrf),
            )
        )
        try:
            waiting_queries = await _wait_for_postgres_lock_queries(
                lock_observer,
                application_names={request_name},
            )
            assert "FROM users" in waiting_queries[request_name]
            assert "FOR UPDATE" in waiting_queries[request_name]
            await asyncio.sleep(2.1)
        finally:
            await user_lock_gate.commit()
        refresh = await asyncio.wait_for(refresh_task, timeout=10)

    assert refresh.status_code == 200, refresh.text
    child_token = _extract_refresh_cookie(refresh)
    assert child_token
    child_claims = decode_refresh_token(child_token, settings)
    assert int(child_claims["exp"]) == parent_signed_expiry

    async with session_maker() as observer:
        child_row = (
            await observer.execute(
                select(RefreshToken).where(RefreshToken.jti == child_claims["jti"])
            )
        ).scalar_one()
        assert child_row.expires_at == parent_expires_at


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
    assert test_user.token_version == 0

    initial_row = (
        await db_session.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == test_user.id)
            .where(RefreshToken.revoked_at.is_(None))
        )
    ).scalar_one()
    second_active_row = RefreshToken(
        user_id=test_user.id,
        jti="known-second-active-session",
        token_version=0,
        issued_at=initial_row.issued_at,
        last_used_at=initial_row.last_used_at,
        expires_at=initial_row.expires_at,
        created_ip="127.0.0.1",
        user_agent="pytest-second-session",
    )
    db_session.add(second_active_row)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as client_a,
        AsyncClient(transport=transport, base_url="http://test") as client_b,
    ):
        response_a, response_b = await asyncio.gather(
            client_a.post(
                "/api/v1/auth/refresh",
                headers=_refresh_cookie_headers(initial_cookie, csrf_token),
            ),
            client_b.post(
                "/api/v1/auth/refresh",
                headers=_refresh_cookie_headers(initial_cookie, csrf_token),
            ),
        )

    responses = [response_a, response_b]
    assert sorted(response.status_code for response in responses) == [200, 401]

    winner = next(response for response in responses if response.status_code == 200)
    winner_cookie = _extract_refresh_cookie(winner)
    winner_csrf_cookie = _extract_csrf_cookie(winner)
    winner_access_token = winner.json()["access_token"]
    assert winner_cookie and winner_cookie != initial_cookie
    assert winner_csrf_cookie
    winner_jti = decode_refresh_token(winner_cookie, _refresh_test_settings())["jti"]

    async with AsyncClient(transport=transport, base_url="http://test") as verifier:
        winner_me_before_replay = await verifier.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {winner_access_token}"},
        )
        assert winner_me_before_replay.status_code == 200

        from app.core.activity_logger import audit_logger

        emitted_failed_refreshes: list[dict[str, object]] = []

        def capture_failed_refresh(_event: str, **kwargs: object) -> None:
            if kwargs.get("event_type") == ActivityAction.FAILED_REFRESH.value:
                emitted_failed_refreshes.append(kwargs)

        monkeypatch.setattr(audit_logger, "info", capture_failed_refresh)
        monkeypatch.setattr(audit_logger, "warning", capture_failed_refresh)

        stale_replay = await verifier.post(
            "/api/v1/auth/refresh",
            headers=_refresh_cookie_headers(initial_cookie, csrf_token),
        )
        assert stale_replay.status_code == 401
        assert stale_replay.json() == {"detail": "Refresh session not found"}
        assert any(
            "riskhub_refresh_token=" in header and "Max-Age=0" in header
            for header in stale_replay.headers.get_list("set-cookie")
        )

        winner_me_after_replay = await verifier.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {winner_access_token}"},
        )
        assert winner_me_after_replay.status_code == 401
        assert winner_me_after_replay.json() == {"detail": "Session revoked"}

        repeated_stale_replay = await verifier.post(
            "/api/v1/auth/refresh",
            headers=_refresh_cookie_headers(initial_cookie, csrf_token),
        )
        assert repeated_stale_replay.status_code == 401
        assert repeated_stale_replay.json() == {"detail": "Refresh session not found"}

    rows = (
        (
            await db_session.execute(
                select(RefreshToken)
                .where(RefreshToken.user_id == test_user.id)
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    newly_contained = [row for row in rows if row.revoked_reason == "replay_detected"]
    assert {row.jti for row in newly_contained} == {
        winner_jti,
        "known-second-active-session",
    }

    refreshed_user = (
        await db_session.execute(
            select(User)
            .where(User.id == test_user.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert refreshed_user.token_version == 1

    containment_events = (
        (
            await db_session.execute(
                select(ActivityLog)
                .where(ActivityLog.entity_id == test_user.id)
                .where(ActivityLog.action == ActivityAction.FAILED_REFRESH.value)
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    assert len(containment_events) == 1
    assert containment_events[0].changes == {
        "failure_code": "replay_detected",
        "revoke_count": 2,
    }
    structured_containment_events = [
        event
        for event in emitted_failed_refreshes
        if event.get("changes")
        == {"failure_code": "replay_detected", "revoke_count": 2}
    ]
    assert len(structured_containment_events) == 1


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_concurrent_active_parent_rotation_has_one_winner_before_replay_postgres(
    client_factory,
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip(
            "PostgreSQL row locks are required for replay-containment concurrency"
        )

    settings = _role_aware_refresh_settings()
    async with client_factory(settings=settings) as setup_client:
        await _login_via_sso_exchange(
            setup_client,
            db_session,
            test_user,
            monkeypatch,
            external_id="oid-refresh-concurrent-stale-replay",
        )
        stale_parent = setup_client.cookies.get("riskhub_refresh_token")
        csrf_token = setup_client.cookies.get("riskhub_csrf_token")
        assert stale_parent and csrf_token

    request_names = {
        "riskhub_issue123_initial_a",
        "riskhub_issue123_initial_b",
    }
    independent_db_session = _independent_db_override(
        async_engine,
        application_names=tuple(sorted(request_names)),
    )
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with (
        session_maker() as user_lock_gate,
        session_maker() as lock_observer,
        client_factory(
            settings=settings, db_override=independent_db_session
        ) as concurrent_client,
    ):
        stale_headers = _refresh_cookie_headers(stale_parent, csrf_token)
        (
            initial_a,
            initial_b,
            waiting_queries,
        ) = await _run_two_refreshes_behind_user_lock(
            client=concurrent_client,
            user_lock_gate=user_lock_gate,
            lock_observer=lock_observer,
            user_id=test_user.id,
            headers=stale_headers,
            application_names=request_names,
        )
        assert all(
            "FROM users" in query and "FOR UPDATE" in query
            for query in waiting_queries.values()
        )
        assert sorted((initial_a.status_code, initial_b.status_code)) == [200, 401]
        winner = next(
            response
            for response in (initial_a, initial_b)
            if response.status_code == 200
        )
        winner_access_token = winner.json()["access_token"]

        winner_me_before_replay = await concurrent_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {winner_access_token}"},
        )
        assert winner_me_before_replay.status_code == 200

        explicit_stale_replay = await concurrent_client.post(
            "/api/v1/auth/refresh", headers=stale_headers
        )
        assert explicit_stale_replay.status_code == 401
        assert explicit_stale_replay.json() == {"detail": "Refresh session not found"}

        winner_me_after_replay = await concurrent_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {winner_access_token}"},
        )
        assert winner_me_after_replay.status_code == 401
        assert winner_me_after_replay.json() == {"detail": "Session revoked"}

    async for observer in independent_db_session():
        user = (
            await observer.execute(select(User).where(User.id == test_user.id))
        ).scalar_one()
        assert user.token_version == 1

        active_rows = (
            (
                await observer.execute(
                    select(RefreshToken)
                    .where(RefreshToken.user_id == test_user.id)
                    .where(RefreshToken.revoked_at.is_(None))
                )
            )
            .scalars()
            .all()
        )
        assert active_rows == []

        containment_events = (
            (
                await observer.execute(
                    select(ActivityLog)
                    .where(ActivityLog.entity_id == test_user.id)
                    .where(ActivityLog.action == ActivityAction.FAILED_REFRESH.value)
                )
            )
            .scalars()
            .all()
        )
        assert len(containment_events) == 1
        assert containment_events[0].changes == {
            "failure_code": "replay_detected",
            "revoke_count": 1,
        }


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_concurrent_already_rotated_stale_replay_is_contained_once_postgres(
    client_factory,
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row locks are required for stale-replay concurrency")

    settings = _role_aware_refresh_settings()
    async with client_factory(settings=settings) as setup_client:
        await _login_via_sso_exchange(
            setup_client,
            db_session,
            test_user,
            monkeypatch,
            external_id="oid-refresh-concurrent-already-rotated-replay",
        )
        stale_parent = setup_client.cookies.get("riskhub_refresh_token")
        initial_csrf = setup_client.cookies.get("riskhub_csrf_token")
        assert stale_parent and initial_csrf

        first_rotation = await setup_client.post(
            "/api/v1/auth/refresh",
            headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(initial_csrf)},
        )
        assert first_rotation.status_code == 200, first_rotation.text
        active_child = _extract_refresh_cookie(first_rotation)
        assert active_child

    active_child_jti = decode_refresh_token(active_child, settings)["jti"]
    active_child_row = (
        await db_session.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == test_user.id)
            .where(RefreshToken.jti == active_child_jti)
        )
    ).scalar_one()
    second_active_jti = "issue123-second-active-session"
    db_session.add(
        RefreshToken(
            user_id=test_user.id,
            jti=second_active_jti,
            token_version=active_child_row.token_version,
            issued_at=active_child_row.issued_at,
            last_used_at=active_child_row.last_used_at,
            expires_at=active_child_row.expires_at,
            created_ip="127.0.0.1",
            user_agent="pytest-second-active-session",
        )
    )
    await db_session.commit()

    request_names = {
        "riskhub_issue123_stale_a",
        "riskhub_issue123_stale_b",
    }
    independent_db_session = _independent_db_override(
        async_engine,
        application_names=tuple(sorted(request_names)),
    )
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with (
        session_maker() as user_lock_gate,
        session_maker() as lock_observer,
        client_factory(
            settings=settings, db_override=independent_db_session
        ) as concurrent_client,
    ):
        stale_headers = _refresh_cookie_headers(stale_parent, initial_csrf)
        stale_a, stale_b, waiting_queries = await _run_two_refreshes_behind_user_lock(
            client=concurrent_client,
            user_lock_gate=user_lock_gate,
            lock_observer=lock_observer,
            user_id=test_user.id,
            headers=stale_headers,
            application_names=request_names,
        )

        assert all(
            "FROM users" in query and "FOR UPDATE" in query
            for query in waiting_queries.values()
        )
        assert [stale_a.status_code, stale_b.status_code] == [401, 401]
        for response in (stale_a, stale_b):
            assert response.json() == {"detail": "Refresh session not found"}

    async with session_maker() as observer:
        user = (
            await observer.execute(select(User).where(User.id == test_user.id))
        ).scalar_one()
        assert user.token_version == 1

        refresh_rows = (
            (
                await observer.execute(
                    select(RefreshToken).where(RefreshToken.user_id == test_user.id)
                )
            )
            .scalars()
            .all()
        )
        assert [row for row in refresh_rows if row.revoked_at is None] == []
        replay_rows = [
            row for row in refresh_rows if row.revoked_reason == "replay_detected"
        ]
        assert {row.jti for row in replay_rows} == {
            active_child_jti,
            second_active_jti,
        }

        containment_events = (
            (
                await observer.execute(
                    select(ActivityLog)
                    .where(ActivityLog.entity_id == test_user.id)
                    .where(ActivityLog.action == ActivityAction.FAILED_REFRESH.value)
                )
            )
            .scalars()
            .all()
        )
        assert len(containment_events) == 1
        assert containment_events[0].changes == {
            "failure_code": "replay_detected",
            "revoke_count": 2,
        }


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_stale_replay_and_near_expiry_share_user_first_lock_order_postgres(
    client_factory,
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip(
            "PostgreSQL row locks are required for failure-path collision coverage"
        )

    settings = _role_aware_refresh_settings()
    async with client_factory(settings=settings) as setup_client:
        await _login_via_sso_exchange(
            setup_client,
            db_session,
            test_user,
            monkeypatch,
            external_id="oid-refresh-replay-near-expiry-collision",
        )
        stale_parent = setup_client.cookies.get("riskhub_refresh_token")
        initial_csrf = setup_client.cookies.get("riskhub_csrf_token")
        assert stale_parent and initial_csrf

        first_rotation = await setup_client.post(
            "/api/v1/auth/refresh",
            headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(initial_csrf)},
        )
        assert first_rotation.status_code == 200, first_rotation.text

    near_expiry_jti = "issue123-near-expiry-collision"
    near_expiry_csrf = "issue123-near-expiry-csrf"
    now = utc_now()
    near_expiry_token, _ = create_refresh_token(
        user_id=test_user.id,
        token_version=test_user.token_version,
        jti=near_expiry_jti,
        settings=settings,
        expires_delta=timedelta(seconds=30),
    )
    near_expiry_row = RefreshToken(
        user_id=test_user.id,
        jti=near_expiry_jti,
        token_version=test_user.token_version,
        issued_at=now,
        last_used_at=now,
        expires_at=now + timedelta(seconds=30),
        created_ip="127.0.0.1",
        user_agent="pytest-near-expiry-collision",
    )
    db_session.add(near_expiry_row)
    await db_session.commit()
    await db_session.refresh(near_expiry_row)

    near_name = "riskhub_issue123_near_expiry"
    stale_name = "riskhub_issue123_stale_replay"
    independent_db_session = _independent_db_override(
        async_engine,
        application_names=(near_name, stale_name),
    )
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with (
        session_maker() as refresh_row_gate,
        session_maker() as lock_observer,
        client_factory(
            settings=settings,
            db_override=independent_db_session,
            raise_app_exceptions=False,
        ) as concurrent_client,
    ):
        await refresh_row_gate.execute(
            select(RefreshToken)
            .where(RefreshToken.id == near_expiry_row.id)
            .with_for_update()
        )
        near_task = asyncio.create_task(
            concurrent_client.post(
                "/api/v1/auth/refresh",
                headers=_refresh_cookie_headers(near_expiry_token, near_expiry_csrf),
            )
        )
        await _wait_for_postgres_lock_queries(
            lock_observer,
            application_names={near_name},
        )
        stale_task = asyncio.create_task(
            concurrent_client.post(
                "/api/v1/auth/refresh",
                headers=_refresh_cookie_headers(stale_parent, initial_csrf),
            )
        )
        try:
            waiting_queries = await _wait_for_postgres_lock_queries(
                lock_observer,
                application_names={near_name, stale_name},
            )
        finally:
            await refresh_row_gate.commit()
        near_response, stale_response = await asyncio.wait_for(
            asyncio.gather(near_task, stale_task),
            timeout=10,
        )

        assert "FROM users" in waiting_queries[stale_name]
        assert "FOR UPDATE" in waiting_queries[stale_name]
        assert near_response.status_code == 401
        assert near_response.json() == {"detail": "Refresh token expired"}
        assert stale_response.status_code == 401
        assert stale_response.json() == {"detail": "Refresh session not found"}
        for response in (near_response, stale_response):
            assert any(
                "riskhub_refresh_token=" in header and "Max-Age=0" in header
                for header in response.headers.get_list("set-cookie")
            )

    async with session_maker() as observer:
        user = (
            await observer.execute(select(User).where(User.id == test_user.id))
        ).scalar_one()
        assert user.token_version == 1
        assert (
            await observer.execute(
                select(RefreshToken)
                .where(RefreshToken.user_id == test_user.id)
                .where(RefreshToken.revoked_at.is_(None))
            )
        ).scalars().all() == []
        failure_events = (
            (
                await observer.execute(
                    select(ActivityLog)
                    .where(ActivityLog.entity_id == test_user.id)
                    .where(ActivityLog.action == ActivityAction.FAILED_REFRESH.value)
                )
            )
            .scalars()
            .all()
        )
        assert {event.changes["failure_code"] for event in failure_events} == {
            "expires_soon",
            "replay_detected",
        }


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_refresh_rotation_collision_with_stale_replay_has_no_authority_escape_postgres(
    client_factory,
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip(
            "PostgreSQL row locks are required for replay/rotation collision coverage"
        )

    settings = _role_aware_refresh_settings()
    async with client_factory(settings=settings) as setup_client:
        await _login_via_sso_exchange(
            setup_client,
            db_session,
            test_user,
            monkeypatch,
            external_id="oid-refresh-replay-rotation-collision",
        )
        stale_parent = setup_client.cookies.get("riskhub_refresh_token")
        initial_csrf = setup_client.cookies.get("riskhub_csrf_token")
        assert stale_parent and initial_csrf

        first_rotation = await setup_client.post(
            "/api/v1/auth/refresh",
            headers={"Origin": TEST_ORIGIN, "X-CSRF-Token": str(initial_csrf)},
        )
        assert first_rotation.status_code == 200, first_rotation.text
        active_child = _extract_refresh_cookie(first_rotation)
        active_child_csrf = _extract_csrf_cookie(first_rotation)
        assert active_child and active_child_csrf

    independent_db_session = _independent_db_override(async_engine)

    async with client_factory(
        settings=settings, db_override=independent_db_session
    ) as concurrent_client:
        stale_response, rotation_response = await asyncio.wait_for(
            asyncio.gather(
                concurrent_client.post(
                    "/api/v1/auth/refresh",
                    headers=_refresh_cookie_headers(stale_parent, initial_csrf),
                ),
                concurrent_client.post(
                    "/api/v1/auth/refresh",
                    headers=_refresh_cookie_headers(active_child, active_child_csrf),
                ),
            ),
            timeout=10,
        )
        assert stale_response.status_code == 401
        assert rotation_response.status_code in {200, 401}

        if rotation_response.status_code == 200:
            rotated_access_token = rotation_response.json()["access_token"]
            rotated_me = await concurrent_client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {rotated_access_token}"},
            )
            assert rotated_me.status_code == 401
            assert rotated_me.json() == {"detail": "Session revoked"}

    async for observer in independent_db_session():
        user = (
            await observer.execute(select(User).where(User.id == test_user.id))
        ).scalar_one()
        assert user.token_version == 1
        assert (
            await observer.execute(
                select(RefreshToken)
                .where(RefreshToken.user_id == test_user.id)
                .where(RefreshToken.revoked_at.is_(None))
            )
        ).scalars().all() == []

        containment_events = (
            (
                await observer.execute(
                    select(ActivityLog)
                    .where(ActivityLog.entity_id == test_user.id)
                    .where(ActivityLog.action == ActivityAction.FAILED_REFRESH.value)
                )
            )
            .scalars()
            .all()
        )
        assert len(containment_events) == 1
        assert containment_events[0].changes == {
            "failure_code": "replay_detected",
            "revoke_count": 1,
        }


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


def test_refresh_token_treats_naive_absolute_expiry_as_utc() -> None:
    settings = Settings(secret_key=TEST_SECRET_KEY)
    naive_expiry = datetime(2040, 6, 1, 12, 34, 56)
    expected_expiry = datetime(2040, 6, 1, 12, 34, 56, tzinfo=UTC)

    token, expires_at = create_refresh_token(
        user_id=1,
        token_version=1,
        jti="naive-absolute-expiry-jti",
        settings=settings,
        expires_at=naive_expiry,
    )
    payload = decode_refresh_token(token, settings)

    assert expires_at == expected_expiry
    assert expires_at.tzinfo is UTC
    assert payload["exp"] == int(expected_expiry.timestamp())


def test_refresh_token_normalizes_offset_absolute_expiry_to_utc() -> None:
    settings = Settings(secret_key=TEST_SECRET_KEY)
    offset_expiry = datetime(
        2040,
        6,
        1,
        18,
        34,
        56,
        tzinfo=timezone(timedelta(hours=5, minutes=30)),
    )
    expected_expiry = datetime(2040, 6, 1, 13, 4, 56, tzinfo=UTC)

    token, expires_at = create_refresh_token(
        user_id=1,
        token_version=1,
        jti="offset-absolute-expiry-jti",
        settings=settings,
        expires_at=offset_expiry,
    )
    payload = decode_refresh_token(token, settings)

    assert expires_at == expected_expiry
    assert expires_at.tzinfo is UTC
    assert payload["exp"] == int(expected_expiry.timestamp())


def test_decode_refresh_token_accepts_modern_claims_with_grace_disabled() -> None:
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=False)
    token, _ = create_refresh_token(
        user_id=1,
        token_version=1,
        jti="modern-claims-jti",
        settings=settings,
    )

    payload = decode_refresh_token(token, settings)

    assert payload["aud"] == REFRESH_TOKEN_AUDIENCE
    assert payload["iss"] == REFRESH_TOKEN_ISSUER
    assert payload["type"] == REFRESH_TOKEN_TYPE


@pytest.mark.parametrize(
    ("claim", "invalid_value", "expected_error"),
    [
        ("aud", "wrong-audience", jwt.InvalidAudienceError),
        ("iss", "wrong-issuer", jwt.InvalidIssuerError),
    ],
)
def test_decode_refresh_token_grace_rejects_incorrect_modern_claims(
    claim: str,
    invalid_value: str,
    expected_error: type[jwt.InvalidTokenError],
) -> None:
    settings = Settings(secret_key=TEST_SECRET_KEY, refresh_token_migration_grace=True)
    claims = {
        "type": REFRESH_TOKEN_TYPE,
        "aud": REFRESH_TOKEN_AUDIENCE,
        "iss": REFRESH_TOKEN_ISSUER,
        "user_id": 1,
        "token_version": 1,
        "jti": "invalid-modern-claims-jti",
        "exp": datetime.now(UTC) + timedelta(hours=1),
    }
    claims[claim] = invalid_value
    token = jwt.encode(claims, TEST_SECRET_KEY, algorithm="HS256")

    with pytest.raises(expected_error):
        decode_refresh_token(token, settings)


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
