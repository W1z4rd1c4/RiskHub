"""New-secret wire bounds deliberately precede proof validation (#193)."""

import pytest
from pydantic import ValidationError

from app.core.security import get_password_hash
from app.models import LocalAuthGrant, User
from app.schemas.local_auth import (
    EnrollmentStartRequest,
    PasswordChangeRequest,
    RecentAuthenticationRequest,
    RecoveryStartRequest,
    ResetCompleteRequest,
)
from tests.backend.pytest.test_local_identity import (
    PASSWORD,
    create_invitation,
    csrf,
    latest_mail,
    login_password_only,
)
from tests.backend.pytest.test_local_recovery import recent

MODELS = [
    EnrollmentStartRequest,
    ResetCompleteRequest,
    PasswordChangeRequest,
    RecoveryStartRequest,
]
INVALID = "0" * 32 + "." + "A" * 43


def new_secret(length):
    return ("Unique-wire-secret-479!" * 7)[:length]


@pytest.mark.parametrize("model", MODELS)
@pytest.mark.parametrize("length", [13, 14, 15, 128, 129])
def test_new_secret_schema_bounds(model, length):
    field = "new_password" if model is RecoveryStartRequest else "password"
    proof = "recent_auth_proof" if model is PasswordChangeRequest else "grant"
    body = {proof: INVALID, field: new_secret(length)}
    if 15 <= length <= 128:
        assert getattr(model(**body), field).get_secret_value() == new_secret(length)
    else:
        with pytest.raises(ValidationError):
            model(**body)


def test_current_and_intended_secret_contracts_remain_distinct():
    assert (
        RecoveryStartRequest(grant=INVALID, current_password="short").new_password
        is None
    )
    request = RecentAuthenticationRequest(
        password="short",
        target_user_id=1,
        operation="password_change",
        intended_password="tiny",
    )
    assert request.password.get_secret_value() == "short"
    assert request.intended_password.get_secret_value() == "tiny"


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ["enrollment", "reset", "change", "recovery"])
@pytest.mark.parametrize("length", [13, 14, 15, 128, 129])
async def test_new_secret_http_precedence_preserves_real_artifact(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
    route,
    length,
):
    native_context.local_mfa_policy = "optional"
    test_user.hashed_password = get_password_hash(PASSWORD)
    uid = await create_invitation(
        client_factory,
        native_context,
        db_session,
        test_user,
        test_user_employee.role_id,
    )
    _, invite = await latest_mail(
        db_session, native_context, user_id=uid, kind="invitation"
    )
    chosen = new_secret(length if 15 <= length <= 128 else 15)
    async with client_factory(
        settings=native_context, headers={"Origin": "http://test"}
    ) as client:
        await csrf(client)
        raw, field, proof = invite["credential"], "password", "grant"
        path = "/api/v1/auth/local/enrollment/start"
        if route != "enrollment":
            enrolled = await client.post(
                path, json={"grant": raw, "password": PASSWORD}
            )
            assert enrolled.status_code == 202 and enrolled.json()["status"] == "completed", enrolled.text
            if route == "reset":
                response = await client.post(
                    "/api/v1/auth/local/password/reset/request",
                    json={"email": "journey@example.com"},
                )
                assert response.status_code == 202, response.text
                _, mail = await latest_mail(
                    db_session, native_context, user_id=uid, kind="reset"
                )
                raw, path = (
                    mail["credential"],
                    "/api/v1/auth/local/password/reset/complete",
                )
            elif route == "change":
                await login_password_only(client, "journey@example.com")
                response = await client.post(
                    "/api/v1/auth/local/recent-auth",
                    json={
                        "password": PASSWORD,
                        "target_user_id": uid,
                        "operation": "password_change",
                        "intended_password": chosen,
                    },
                )
                assert response.status_code == 200, response.text
                raw, proof, path = (
                    response.json()["proof"],
                    "recent_auth_proof",
                    "/api/v1/auth/local/password/change",
                )
            else:
                await login_password_only(client, test_user.email)
                target = await db_session.get(User, uid, populate_existing=True)
                approval = await recent(
                    client,
                    uid,
                    None,
                    "assisted_recovery",
                    expected_token_version=target.token_version,
                    intended_recovery_operation="credential_and_factor_recovery",
                )
                response = await client.post(
                    f"/api/v1/users/{uid}/recovery",
                    json={
                        "recent_auth_proof": approval,
                        "expected_token_version": target.token_version,
                        "operation": "credential_and_factor_recovery",
                        "incident_reference": "TEST-193",
                        "verification_method": "in-person",
                        "reason": "Test verified lost credentials",
                    },
                )
                assert response.status_code == 202, response.text
                _, mail = await latest_mail(
                    db_session, native_context, user_id=uid, kind="recovery"
                )
                raw, field, path = (
                    mail["credential"],
                    "new_password",
                    "/api/v1/auth/local/recovery/start",
                )
                client.headers.pop("Authorization", None)
        # A structurally valid but nonexistent proof proves the real401 control;
        # missing required fields would give an unrelated framework422.
        control = await client.post(path, json={proof: INVALID, field: chosen})
        assert control.status_code == 401, control.text
        target = await db_session.get(User, uid, populate_existing=True)
        before = (
            target.hashed_password,
            target.token_version,
            target.local_enrollment_state,
            target.local_recovery_pending,
        )
        grant = await db_session.get(
            LocalAuthGrant, raw.split(".")[0], populate_existing=True
        )
        assert grant.consumed_at is None and grant.revoked_at is None
        candidate = new_secret(length)
        if not 15 <= length <= 128:
            precedence = await client.post(
                path, json={proof: INVALID, field: candidate}
            )
            assert precedence.status_code == 422, precedence.text
            denied = await client.post(path, json={proof: raw, field: candidate})
            assert denied.status_code == 422, denied.text
            assert candidate not in denied.text and raw not in denied.text
            await db_session.refresh(grant)
            await db_session.refresh(target)
            assert grant.consumed_at is None and grant.revoked_at is None
            assert (
                target.hashed_password,
                target.token_version,
                target.local_enrollment_state,
                target.local_recovery_pending,
            ) == before
        accepted = await client.post(path, json={proof: raw, field: chosen})
        assert accepted.status_code == (202 if route == "enrollment" else 200), accepted.text
        await db_session.refresh(grant)
        assert grant.consumed_at is not None
