"""Real native issuer/lineage evidence under a pinned completion clock (#199)."""

from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie

import pytest
from freezegun import freeze_time
from sqlalchemy import select

from app.core.datetime_utils import coerce_utc
from app.core.security import decode_access_token
from app.core.tokens import create_refresh_token, decode_refresh_token
from app.models import RefreshToken, User
from tests.backend.pytest.test_local_identity import PASSWORD, create_invitation, csrf, enroll, latest_mail

ORIGIN = datetime(2026, 10, 11, 12, 0, 0, tzinfo=UTC)


async def complete_login(client, db, settings, invitation, email, *, factor):
    if factor:
        # Enroll with the supported required policy, then exercise either policy
        # with the genuinely confirmed factor (optional must still challenge).
        selected = settings.local_mfa_policy
        settings.local_mfa_policy = "required"
        codes, _ = await enroll(client, invitation)
        settings.local_mfa_policy = selected
    else:
        await csrf(client)
        result = await client.post(
            "/api/v1/auth/local/enrollment/start", json={"grant": invitation, "password": PASSWORD}
        )
        assert result.status_code == 202 and result.json()["status"] == "completed", result.text
    result = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    if factor:
        assert result.status_code == 202 and result.json()["status"] == "mfa_required", result.text
        assert "access_token" not in result.json() and not client.cookies.get("riskhub_refresh_token")
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        result = await client.post(
            "/api/v1/auth/local/mfa/verify",
            json={"challenge": result.json()["challenge"], "code": codes[0], "method": "recovery_code"},
        )
    assert result.status_code == 200, result.text
    return result


async def assert_lineage(response, client, db, settings, *, elapsed, ttl, factor):
    access = decode_access_token(response.json()["access_token"], settings=settings)
    refresh = decode_refresh_token(client.cookies["riskhub_refresh_token"], settings)
    origin = int(ORIGIN.timestamp())
    bound = origin + 8 * 3600
    for claims in [access, refresh]:
        assert claims["auth_time"] == origin and claims["session_exp"] == bound
        assert claims["auth_method"] == ("local_mfa" if factor else "local_password")
        assert (claims["factor_generation"] is not None) == factor
    assert access["exp"] == min(origin + elapsed + ttl, bound)
    assert refresh["exp"] == bound
    row = await db.scalar(select(RefreshToken).where(RefreshToken.jti == refresh["jti"]))
    assert row is not None and row.revoked_at is None
    assert coerce_utc(row.authenticated_at) == ORIGIN
    assert coerce_utc(row.expires_at) == ORIGIN + timedelta(hours=8)
    assert row.factor_generation == refresh["factor_generation"]
    assert row.installation_id == refresh["installation_id"]
    cookies = SimpleCookie()
    for header in response.headers.get_list("set-cookie"):
        cookies.load(header)
    # The canonical issuer emits Max-Age, not an Expires attribute.
    assert int(cookies["riskhub_refresh_token"]["max-age"]) == 8 * 3600 - elapsed
    client.headers["X-CSRF-Token"] = client.cookies["riskhub_csrf_token"]
    return refresh


@pytest.mark.asyncio
@pytest.mark.parametrize("policy,factor", [("required", True), ("optional", True), ("optional", False)])
@pytest.mark.parametrize("admin", [False, True])
async def test_native_signed_ttl_and_repeated_refresh_keep_original_bound(
    native_context, client_factory, db_session, test_user, test_user_employee, policy, factor, admin
):
    native_context.local_mfa_policy = policy
    with freeze_time(ORIGIN, real_asyncio=True):
        user_id = await create_invitation(
            client_factory,
            native_context,
            db_session,
            test_user,
            test_user.role_id if admin else test_user_employee.role_id,
        )
        _, mail = await latest_mail(db_session, native_context, user_id=user_id, kind="invitation")
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            result = await complete_login(
                client, db_session, native_context, mail["credential"], "journey@example.com", factor=factor
            )
            ttl = (15 if admin else 30) * 60
            await assert_lineage(result, client, db_session, native_context, elapsed=0, ttl=ttl, factor=factor)
            for elapsed in [3600, 4 * 3600, 7 * 3600, 8 * 3600 - 61]:
                with freeze_time(ORIGIN + timedelta(seconds=elapsed), real_asyncio=True):
                    result = await client.post("/api/v1/auth/refresh")
                    assert result.status_code == 200, result.text
                    await assert_lineage(
                        result, client, db_session, native_context, elapsed=elapsed, ttl=ttl, factor=factor
                    )
            rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id))).all())
            assert len(rows) == 5 and sum(row.revoked_at is None for row in rows) == 1
            assert all(coerce_utc(row.expires_at) == ORIGIN + timedelta(hours=8) for row in rows)


@pytest.mark.asyncio
@pytest.mark.parametrize("remaining", [61, 60, 59, 0, -1])
async def test_native_refresh_cutoff_uses_independent_fresh_lineage(
    native_context, client_factory, db_session, test_user, test_user_employee, remaining
):
    native_context.local_mfa_policy = "optional"
    with freeze_time(ORIGIN, real_asyncio=True):
        user_id = await create_invitation(
            client_factory, native_context, db_session, test_user, test_user_employee.role_id
        )
        _, mail = await latest_mail(db_session, native_context, user_id=user_id, kind="invitation")
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            result = await complete_login(
                client, db_session, native_context, mail["credential"], "journey@example.com", factor=False
            )
            await assert_lineage(result, client, db_session, native_context, elapsed=0, ttl=1800, factor=False)
            retained_refresh = client.cookies["riskhub_refresh_token"]
            retained_csrf = client.cookies["riskhub_csrf_token"]
            with freeze_time(ORIGIN + timedelta(seconds=8 * 3600 - remaining), real_asyncio=True):
                # Present retained credentials explicitly after cookie expiry to
                # exercise server authority denial rather than cookie-jar/CSRF omission.
                result = await client.post(
                    "/api/v1/auth/refresh",
                    headers={
                        "Cookie": f"riskhub_refresh_token={retained_refresh}; riskhub_csrf_token={retained_csrf}",
                        "X-CSRF-Token": retained_csrf,
                    },
                )
                assert result.status_code == (200 if remaining > 60 else 401), result.text
                if remaining > 60:
                    await assert_lineage(
                        result, client, db_session, native_context, elapsed=8 * 3600 - remaining, ttl=1800, factor=False
                    )
                else:
                    assert "access_token" not in result.json()
            rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id))).all())
            assert len(rows) == (2 if remaining > 60 else 1)
            if remaining in {60, 59}:
                await db_session.refresh(rows[0])
                assert rows[0].revoked_at is not None and rows[0].revoked_reason == "expires_soon"
            # Expired JWTs may fail before row access; no mutation is required at0/-1.


@pytest.mark.asyncio
async def test_signed_native_refresh_without_full_auth_context_is_denied(
    native_context, client_factory, db_session, test_user, test_user_employee
):
    native_context.local_mfa_policy = "optional"
    with freeze_time(ORIGIN, real_asyncio=True):
        user_id = await create_invitation(
            client_factory, native_context, db_session, test_user, test_user_employee.role_id
        )
        _, mail = await latest_mail(db_session, native_context, user_id=user_id, kind="invitation")
        async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
            result = await complete_login(
                client, db_session, native_context, mail["credential"], "journey@example.com", factor=False
            )
            claims = await assert_lineage(result, client, db_session, native_context, elapsed=0, ttl=1800, factor=False)
            user = await db_session.get(User, user_id)
            legacy, _ = create_refresh_token(
                user_id=user_id,
                token_version=user.token_version,
                jti=claims["jti"],
                settings=native_context,
                expires_at=ORIGIN + timedelta(hours=8),
            )
            assert "auth_method" not in decode_refresh_token(legacy, native_context)
            csrf_value = client.cookies["riskhub_csrf_token"]
            response = await client.post(
                "/api/v1/auth/refresh",
                headers={
                    "Cookie": f"riskhub_refresh_token={legacy}; riskhub_csrf_token={csrf_value}",
                    "X-CSRF-Token": csrf_value,
                },
            )
            assert response.status_code == 401 and "access_token" not in response.json()
            assert (
                len(list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id))).all()))
                == 1
            )


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
async def test_eligible_verified_account_password_only_authority_follows_policy(
    native_context, client_factory, db_session, test_user_employee, policy
):
    from app.core.datetime_utils import utc_now
    from app.core.security import get_password_hash

    native_context.local_mfa_policy = policy
    test_user_employee.hashed_password = get_password_hash(PASSWORD)
    test_user_employee.local_email_verified_at = utc_now()
    test_user_employee.local_enrollment_state = "enrolled"
    await db_session.commit()
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        login = await client.post("/api/v1/auth/login", json={"email": test_user_employee.email, "password": PASSWORD})
        bearer = login.json().get("access_token")
        me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"} if bearer else {})
        observed = (
            login.status_code,
            bearer is not None,
            bool(client.cookies.get("riskhub_refresh_token")),
            me.status_code,
        )
        assert observed == ((202, False, False, 401) if policy == "required" else (200, True, True, 200))
        if policy == "required":
            assert login.json()["status"] == "enrollment_required"
        rows = list(
            (await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == test_user_employee.id))).all()
        )
        assert len(rows) == (0 if policy == "required" else 1)
