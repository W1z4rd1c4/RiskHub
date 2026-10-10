"""Public regressions for remaining #196/#199 response and audit contracts."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.models import ActivityLog
from app.models.activity_log import ActivityAction
from app.schemas.directory import DirectoryUserRead
from app.services.directory_provider_service import DirectoryProviderService
from tests.backend.pytest.test_identity_foundations import identity_settings
from tests.backend.pytest.test_local_identity import PASSWORD, create_invitation, csrf, enroll, latest_mail


@pytest.mark.asyncio
@pytest.mark.parametrize("suspended", [True, False])
async def test_directory_single_and_all_preserve_locally_unavailable_states(
    db_session, client_factory, test_user, test_user_employee, monkeypatch, suspended
):
    employee = test_user_employee
    employee.external_id = "11111111-0000-4000-8000-000000000001"
    employee.is_active = False
    employee.local_suspended = suspended
    await db_session.commit()
    remote = DirectoryUserRead(
        external_id=employee.external_id,
        display_name=employee.name,
        email=employee.email,
        user_principal_name=employee.email,
        account_enabled=True,
        source="graph",
    )
    monkeypatch.setattr(DirectoryProviderService, "get_user", AsyncMock(return_value=remote))
    expected = "suspended" if suspended else "inactive"
    async with client_factory(current_user=test_user, settings=identity_settings(mock_auth_enabled=True)) as client:
        single = await client.post(f"/api/v1/admin/directory/check-user/{employee.id}")
        all_users = await client.post("/api/v1/admin/directory/check-all")
    assert single.status_code == all_users.status_code == 200
    assert single.json()["status"] == expected
    result = all_users.json()
    assert result[expected] == 1
    assert result["active"] == result["deprovisioned"] == 0
    assert result["checked"] == sum(
        result[key] for key in ("active", "deprovisioned", "suspended", "inactive", "errors", "skipped")
    )
    assert [row["status"] for row in result["results"]] == [expected]
    await db_session.refresh(employee)
    assert employee.is_active is False
    assert employee.local_suspended is suspended


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", ["required", "optional"])
async def test_native_http_audit_preserves_authentication_action_types(
    db_session, client_factory, native_context, test_user, test_user_employee, policy, monkeypatch
):
    from app.core import activity_logger

    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    native_context.local_mfa_policy = policy
    user_id = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    _, mail = await latest_mail(db_session, native_context, user_id=user_id, kind="invitation")
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        if policy == "required":
            codes, _ = await enroll(client, mail["credential"])
        else:
            await csrf(client)
            result = await client.post(
                "/api/v1/auth/local/enrollment/start",
                json={
                    "grant": mail["credential"],
                    "password": PASSWORD,
                },
            )
            assert result.status_code == 202
            assert result.json()["status"] == "completed"
        wrong = await client.post("/api/v1/auth/login", json={"email": "absent@example.test", "password": PASSWORD})
        assert wrong.status_code == 401
        result = await client.post("/api/v1/auth/login", json={"email": "journey@example.com", "password": PASSWORD})
        if policy == "required":
            assert result.status_code == 202
            challenge = result.json()["challenge"]
            denied = await client.post(
                "/api/v1/auth/local/mfa/verify",
                json={
                    "challenge": challenge,
                    "code": "invalid-backup-code",
                    "method": "recovery_code",
                },
            )
            assert denied.status_code == 401
            result = await client.post(
                "/api/v1/auth/local/mfa/verify",
                json={
                    "challenge": challenge,
                    "code": codes[0],
                    "method": "recovery_code",
                },
            )
        assert result.status_code == 200
        client.headers["Authorization"] = "Bearer " + result.json()["access_token"]
        await csrf(client)
        denied = await client.post(
            "/api/v1/auth/local/recent-auth",
            json={
                "password": "Wrong current password",
                "target_user_id": user_id,
                "operation": "password_change",
                "intended_password": PASSWORD,
            },
        )
        assert denied.status_code == 401
        if policy == "required":
            denied = await client.post(
                "/api/v1/auth/local/recent-auth",
                json={
                    "password": PASSWORD,
                    "factor": "invalid-backup-code",
                    "method": "recovery_code",
                    "target_user_id": user_id,
                    "operation": "password_change",
                    "intended_password": PASSWORD,
                },
            )
            assert denied.status_code == 401
            fresh = await client.post("/api/v1/auth/login", json={"email": "journey@example.com", "password": PASSWORD})
            assert fresh.status_code == 202
            invalid = fresh.json()["challenge"].split(".")[0] + "." + "x" * 43
            for _ in range(5):
                denied = await client.post(
                    "/api/v1/auth/local/mfa/verify",
                    json={
                        "challenge": invalid,
                        "code": "invalid-backup-code",
                        "method": "recovery_code",
                    },
                )
                assert denied.status_code == 401
    rows = (await db_session.execute(select(ActivityLog).order_by(ActivityLog.id))).scalars().all()
    events = {row.description: row for row in rows}
    event = "local_login_completed" if policy == "required" else "local_password_login_completed"
    assert events[event].action == ActivityAction.LOGIN
    assert events[event].actor_id == user_id
    assert events["local_login_failed"].action == ActivityAction.FAILED_LOGIN
    assert events["local_login_failed"].entity_id == 0
    assert events["local_recent_auth_failed"].action == ActivityAction.FAILED_LOGIN
    assert events["local_password_enrolled"].action == ActivityAction.UPDATE
    if policy == "required":
        assert events["local_factor_failed"].action == ActivityAction.FAILED_LOGIN
        assert events["local_factor_enrolled"].action == ActivityAction.UPDATE
        assert events["local_recent_factor_failed"].action == ActivityAction.FAILED_LOGIN
        assert events["local_grant_attempts_exhausted"].action == ActivityAction.FAILED_LOGIN
    emitted_events = {entry["description"]: entry for entry in emitted}
    assert emitted_events[event]["event_type"] == "login"
    assert emitted_events["local_login_failed"]["event_type"] == "failed_login"
    if policy == "required":
        assert emitted_events["local_factor_failed"]["event_type"] == "failed_login"
    await db_session.refresh(test_user)
    await db_session.refresh(test_user, attribute_names=["role"])
    async with client_factory(current_user=test_user, settings=native_context) as admin:
        failures = await admin.get("/api/v1/admin/logs", params={"event_type": "failed_login"})
        successes = await admin.get("/api/v1/admin/logs", params={"event_type": "login"})
    assert failures.status_code == successes.status_code == 200
    assert all(entry["level"] == "WARNING" for entry in failures.json())
    expected_failures = {"local_login_failed", "local_recent_auth_failed"}
    if policy == "required":
        expected_failures |= {"local_factor_failed", "local_recent_factor_failed", "local_grant_attempts_exhausted"}
    assert {entry["description"] for entry in failures.json()} >= expected_failures
    assert event in {entry["description"] for entry in successes.json()}
    for row in events.values():
        assert PASSWORD not in str(row.changes)
        assert mail["credential"] not in row.description
