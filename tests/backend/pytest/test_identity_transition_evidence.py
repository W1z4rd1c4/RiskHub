"""#195 additional public transition and strict signed-claim evidence."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import jwt
import pytest
from argon2 import PasswordHasher
from sqlalchemy import select

from app.core.datetime_utils import utc_now
from app.core.security import get_password_hash, password_hash_needs_update
from app.models import RefreshToken
from app.schemas.directory import DirectoryUserRead
from app.services.directory_provider_service import DirectoryProviderService
from tests.backend.pytest.test_identity_foundations import identity_settings
from tests.backend.pytest.test_identity_revocation_acceptance import PASSWORD, login, user_audits
from tests.backend.pytest.test_local_identity import csrf


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,bad",
    [
        ("user_id", None),
        ("user_id", "string"),
        ("user_id", False),
        ("user_id", True),
        ("token_version", None),
        ("token_version", "string"),
        ("token_version", False),
        ("token_version", "stale"),
    ],
)
@pytest.mark.parametrize("kind", ["access", "refresh"])
async def test_production_signed_claim_matrix_retains_valid_control(
    db_session, client_factory, test_user_employee, field, bad, kind
):
    user = test_user_employee
    user.hashed_password = get_password_hash(PASSWORD)
    await db_session.commit()
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    async with client_factory(settings=settings) as client:
        access, headers = await login(client, user.email)
        original = access if kind == "access" else client.cookies["riskhub_refresh_token"]
        # A stale-version presentation intentionally revokes its own refresh
        # row. Use a separate real session as the valid control, not that row.
        _, control_headers = await login(client, user.email)
    claims = jwt.decode(original, options={"verify_signature": False}, algorithms=["HS256"])
    if field == "user_id" and bad is True:
        # True numerically aliases this real account; rejection cannot pass
        # merely because the altered ID points at a nonexistent user.
        assert claims["user_id"] == user.id == 1
    if bad is None:
        claims.pop(field)
    elif bad == "stale":
        claims[field] = user.token_version - 1
    elif bad == "string":
        claims[field] = str(claims[field])
    else:
        claims[field] = bad
    altered = jwt.encode(claims, settings.secret_key, algorithm="HS256")
    production = identity_settings(debug=False)
    async with client_factory(settings=production) as client:
        if kind == "access":
            denied = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {altered}"})
            valid = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
        else:
            original_cookie = original
            altered_headers = {**headers, "Cookie": headers["Cookie"].replace(original_cookie, altered)}
            denied = await client.post("/api/v1/auth/refresh", headers=altered_headers)
            valid = await client.post("/api/v1/auth/refresh", headers=control_headers)
    assert denied.status_code == 401, denied.text
    assert valid.status_code == 200, valid.text


@pytest.mark.asyncio
@pytest.mark.parametrize("transition", ["directory", "admin_revoke", "scope"])
async def test_nonmanual_transition_revokes_retained_credentials_and_persists_one_audit(
    db_session,
    client_factory,
    test_user_platform_admin,
    test_user_cro,
    test_user_employee,
    test_risk,
    monkeypatch,
    transition,
):
    from app.core import activity_logger

    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    user = test_user_employee
    user.hashed_password = get_password_hash(PASSWORD)
    test_risk.owner_id = user.id
    if transition == "directory":
        user.external_id = "11111111-0000-4000-8000-000000000195"
        monkeypatch.setattr(
            DirectoryProviderService,
            "get_user",
            AsyncMock(
                return_value=DirectoryUserRead(
                    external_id=user.external_id,
                    display_name=user.name,
                    email=user.email,
                    user_principal_name=user.email,
                    account_enabled=False,
                    source="graph",
                )
            ),
        )
    await db_session.commit()
    version, identity = user.token_version, user.id
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    async with client_factory(settings=settings) as client:
        bearer, refresh = await login(client, user.email)
        before = len(await user_audits(db_session, identity))
        actor = test_user_cro if transition == "scope" else test_user_platform_admin
        auth = {"X-Mock-User-Id": str(actor.id)}
        if transition == "directory":
            changed = await client.post(f"/api/v1/admin/directory/check-user/{identity}", headers=auth)
        elif transition == "admin_revoke":
            changed = await client.post(f"/api/v1/admin/sessions/{identity}/revoke", headers=auth)
        else:
            changed = await client.patch(
                f"/api/v1/access/users/{identity}", json={"access_scope": "global"}, headers=auth
            )
        assert changed.status_code == 200, changed.text
        await db_session.refresh(user)
        assert user.token_version == version + 1
        rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == identity))).all())
        assert len(rows) == 1 and rows[0].revoked_at is not None
        assert rows[0].revoked_reason
        audits = await user_audits(db_session, identity)
        assert len(audits) == before + 1
        assert audits[-1].actor_id == actor.id
        if transition != "scope":
            expected_event = "directory_deprovisioned" if transition == "directory" else "admin_sessions_revoked"
            assert audits[-1].changes["event_type"] == expected_event
            assert audits[-1].changes["revoke_count"] == 1
            public = await client.get(
                "/api/v1/activity-log",
                params={"entity_type": "user", "entity_id": identity},
                headers={"X-Mock-User-Id": str(test_user_cro.id)},
            )
            assert public.status_code == 200, public.text
            public_row = next(row for row in public.json()["items"] if row["id"] == audits[-1].id)
            streamed = [row for row in emitted if row["entity_id"] == identity and row["event_type"] == "update"]
            assert len(streamed) == 1
            for changes in [public_row["changes"], streamed[0]["changes"]]:
                assert changes["event_type"] == expected_event
                assert changes["revoke_count"] == 1
                assert PASSWORD not in str(changes)
                assert "token_version" not in changes
        if transition == "scope":
            repeated = await client.patch(
                f"/api/v1/access/users/{identity}", json={"access_scope": "global"}, headers=auth
            )
            assert repeated.status_code == 200, repeated.text
            await db_session.refresh(user)
            assert user.token_version == version + 1
            assert len(await user_audits(db_session, identity)) == len(audits)
        await db_session.refresh(test_risk)
        assert test_risk.owner_id == identity
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})).status_code == 401
        assert (await client.post("/api/v1/auth/refresh", headers=refresh)).status_code == 401


@pytest.mark.asyncio
async def test_native_successful_rehash_preserves_existing_session_authority(
    db_session, client_factory, native_context, test_user_employee
):
    user = test_user_employee
    user.hashed_password = get_password_hash(PASSWORD)
    user.local_enrollment_state = "enrolled"
    user.local_email_verified_at = utc_now()
    native_context.local_mfa_policy = "optional"
    await db_session.commit()
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await csrf(client)
        retained, retained_refresh = await login(client, user.email)
        # Model an existing session issued before a KDF parameter upgrade. The
        # credential is identical; only its stored parameterization is older.
        user.hashed_password = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=1).hash(PASSWORD)
        old_hash = user.hashed_password
        assert password_hash_needs_update(old_hash)
        version = user.token_version
        await db_session.commit()
        before = len(await user_audits(db_session, user.id))
        await csrf(client)
        fresh, _ = await login(client, user.email)
        await db_session.refresh(user)
        assert user.hashed_password != old_hash
        assert not password_hash_needs_update(user.hashed_password)
        assert user.token_version == version
        audits = await user_audits(db_session, user.id)
        assert len(audits) == before + 1
        assert audits[-1].action == "login"
        assert "session_authority" not in (audits[-1].changes or {})
        rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id))).all())
        assert len(rows) == 2 and all(row.revoked_at is None for row in rows)
        for bearer in [retained, fresh]:
            assert (
                await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})
            ).status_code == 200
        assert (await client.post("/api/v1/auth/refresh", headers=retained_refresh)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
async def test_security_transition_audit_retains_nonsecret_reason_and_revocation_count(
    db_session, client_factory, test_user_platform_admin, test_user_cro, test_user_employee, monkeypatch, adapter
):
    from app.core import activity_logger
    from app.core.activity_redaction import REDACTED_VALUE

    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    user = test_user_employee
    user.hashed_password = get_password_hash(PASSWORD)
    encoded_password = user.hashed_password
    await db_session.commit()
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    async with client_factory(settings=settings) as client:
        retained, refresh = await login(client, user.email)
        before = len(await user_audits(db_session, user.id))
        changed = await client.patch(
            f"/api/v1/{adapter}/{user.id}",
            json={"is_active": False},
            headers={"X-Mock-User-Id": str(test_user_platform_admin.id)},
        )
        assert changed.status_code == 200, changed.text
        public = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "user", "entity_id": user.id},
            headers={"X-Mock-User-Id": str(test_user_cro.id)},
        )
    audits = await user_audits(db_session, user.id)
    assert len(audits) == before + 1
    transition = audits[-1]
    assert transition.actor_id == test_user_platform_admin.id
    assert public.status_code == 200, public.text
    public_row = next(row for row in public.json()["items"] if row["id"] == transition.id)
    siem = [row for row in emitted if row["entity_id"] == user.id and row["event_type"] == "update"]
    assert len(siem) == 1
    for changes in [transition.changes, public_row["changes"], siem[0]["changes"]]:
        assert changes["revoke_count"] == {"old": None, "new": 1}
        assert changes["event_type"] == {"old": None, "new": "identity_access_changed"}
        assert changes["session_authority"]["new"] == REDACTED_VALUE
    wire = str([transition.changes, public.json(), siem])
    for secret in [PASSWORD, encoded_password, retained, refresh["Cookie"].split(";")[0].split("=", 1)[1]]:
        assert secret not in wire
    assert "token_version" not in str(transition.changes["session_authority"])


@pytest.mark.asyncio
async def test_rejected_access_assignment_preserves_version_refresh_audit_and_business_identity(
    db_session, client_factory, test_user_employee, test_risk
):
    user = test_user_employee
    user.hashed_password = get_password_hash(PASSWORD)
    test_risk.owner_id = user.id
    await db_session.commit()
    version, identity = user.token_version, user.id
    settings = identity_settings(auth_mode="password", mock_auth_enabled=False)
    async with client_factory(settings=settings) as client:
        bearer, retained_refresh = await login(client, user.email)
        before = len(await user_audits(db_session, identity))
        denied = await client.patch(
            f"/api/v1/access/users/{identity}",
            json={"access_scope": "global"},
            headers={"Authorization": f"Bearer {bearer}"},
        )
        assert denied.status_code == 403, denied.text
        await db_session.refresh(user)
        assert user.token_version == version
        rows = list((await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == identity))).all())
        assert len(rows) == 1 and rows[0].revoked_at is None
        assert len(await user_audits(db_session, identity)) == before
        await db_session.refresh(test_risk)
        assert test_risk.owner_id == identity
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})).status_code == 200
        assert (await client.post("/api/v1/auth/refresh", headers=retained_refresh)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("restore", ["directory", "import", "break_glass"])
async def test_directory_restoration_projects_zero_revocations_without_reviving_old_authority(
    db_session, client_factory, test_user_platform_admin, test_user_employee, monkeypatch, restore
):
    from app.core import activity_logger

    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    user = test_user_employee
    user.hashed_password = get_password_hash(PASSWORD)
    user.external_id = "11111111-0000-4000-8000-000000000196"
    await db_session.commit()
    remote = DirectoryUserRead(
        external_id=user.external_id,
        display_name=user.name,
        email=user.email,
        user_principal_name=user.email,
        account_enabled=False,
        source="graph",
    )
    provider = AsyncMock(return_value=remote)
    monkeypatch.setattr(DirectoryProviderService, "get_user", provider)
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    async with client_factory(settings=settings) as client:
        bearer, retained_refresh = await login(client, user.email)
        headers = {"X-Mock-User-Id": str(test_user_platform_admin.id)}
        disabled = await client.post(f"/api/v1/admin/directory/check-user/{user.id}", headers=headers)
        assert disabled.status_code == 200, disabled.text
        before = len(await user_audits(db_session, user.id))
        await db_session.refresh(user)
        version = user.token_version
        if restore == "break_glass":
            result = await client.post(
                f"/api/v1/admin/directory/break-glass-enable/{user.id}",
                json={"reason": "private incident verification narrative", "expires_in_hours": 1},
                headers=headers,
            )
            expected = "directory_break_glass_granted"
        else:
            provider.return_value = remote.model_copy(update={"account_enabled": True})
            if restore == "import":
                result = await client.post(
                    f"/api/v1/directory/users/{user.external_id}/import", json={}, headers=headers
                )
                expected = "directory_import_identity_changed"
            else:
                result = await client.post(f"/api/v1/admin/directory/check-user/{user.id}", headers=headers)
                expected = "directory_eligibility_changed"
        assert result.status_code == 200, result.text
        await db_session.refresh(user)
        assert user.is_active and user.token_version == version + 1
        records = await user_audits(db_session, user.id)
        assert len(records) == before + 1
        assert records[-1].changes == {"event_type": expected, "revoke_count": 0}
        streamed = [event for event in emitted if (event.get("changes") or {}).get("event_type") == expected]
        assert len(streamed) == 1
        assert streamed[0]["changes"] == records[-1].changes
        assert "private incident verification narrative" not in str(streamed)
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bearer}"})).status_code == 401
        assert (await client.post("/api/v1/auth/refresh", headers=retained_refresh)).status_code == 401
