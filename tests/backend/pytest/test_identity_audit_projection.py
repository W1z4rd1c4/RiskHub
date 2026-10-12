"""#195: observe real revocations through existing complete public journeys."""

import importlib
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.core import activity_logger
from app.models import ActivityLog
from app.services._auth_session_workflow.authority import invalidate_user_authority, invalidate_user_sessions
from tests.backend.pytest import test_local_identity, test_local_recovery

MODULES = [
    "_local_auth.enrollment",
    "_local_auth.credentials",
    "_local_auth.factors",
    "_local_auth.factor_management",
    "_local_auth.recovery",
    "_identity_restore.cutover",
    "_identity_restore.review",
]
EVENTS = {
    "local_password_enrollment": "local_password_enrolled",
    "local_password_reset": "local_password_reset_completed",
    "identity_restore_cutover": "identity_restore_user_reconciled",
    "identity_restore_access_review": "identity_restore_access_reviewed",
}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "journey",
    [
        "enrollment_reset",
        "password_email",
        "factor_replace",
        "recovery_codes",
        "factor_recovery",
        "credential_and_factor_recovery",
        "verified_address_recovery",
        "restore_cutover",
    ],
)
async def test_existing_security_journeys_project_actual_revocation_counts(
    db_session, client_factory, native_context, test_user, test_user_employee, monkeypatch, journey
):
    observed, emitted = [], []

    async def observe(**kwargs):
        count = await invalidate_user_sessions(**kwargs)
        observed.append((kwargs["user"].id, kwargs["reason"], count))
        return count

    async def observe_authority(**kwargs):
        counts = await invalidate_user_authority(**kwargs)
        observed.append((kwargs["user"].id, kwargs["reason"], counts.revoke_count))
        return counts

    for module in MODULES:
        name, observer = ("invalidate_user_authority", observe_authority) if module == "_local_auth.credentials" else (
            "invalidate_user_sessions", observe
        )
        monkeypatch.setattr(importlib.import_module(f"app.services.{module}"), name, observer)
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    common = dict(
        native_context=native_context,
        client_factory=client_factory,
        db_session=db_session,
        test_user=test_user,
        test_user_employee=test_user_employee,
    )
    # Reuse existing full HTTP journeys without replacing their service behavior
    # or original assertions; the observer records the real primitive's result.
    if journey == "enrollment_reset":
        await test_local_identity.test_real_enrollment_mfa_refresh_and_reset(**common)
    elif journey == "password_email":
        await test_local_identity.test_recent_proof_binds_password_and_verified_email(**common)
    elif journey in {"factor_replace", "recovery_codes"}:
        await test_local_recovery.test_factor_management(**common, operation=journey)
    elif journey == "restore_cutover":
        from tests.backend.pytest import test_identity_restore

        await test_identity_restore.test_unknown_security_freshness_quarantines_old_password(
            native_context=native_context, db_session=db_session, test_user_employee=test_user_employee
        )
    else:
        await test_local_recovery.test_assisted_recovery(**common, operation=journey)
    assert observed
    records = list((await db_session.scalars(select(ActivityLog))).all())
    for user_id, reason, count in observed:
        event = EVENTS.get(reason, reason)
        stored = [row for row in records if row.entity_id == user_id and row.description == event]
        streamed = [row for row in emitted if row["entity_id"] == user_id and row["description"] == event]
        assert len(stored) == len(streamed) == 1, (user_id, reason)
        for changes in [stored[0].changes, streamed[0]["changes"]]:
            assert changes["event_type"] == event
            assert changes["revoke_count"] == count
            assert "token_version" not in changes
            assert "token" not in changes


@pytest.mark.asyncio
async def test_operator_restore_review_projects_count_without_private_review_evidence(
    native_context, db_session, test_user_platform_admin, tmp_path, monkeypatch
):
    import json
    from datetime import timedelta
    from pathlib import Path
    from uuid import uuid4

    from app.core.datetime_utils import utc_now
    from app.models import IdentityRestoreCutover, InstallationIdentity, RefreshToken
    from app.services._identity_restore import review as review_module
    from app.services._identity_restore.files import fingerprint

    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    user = test_user_platform_admin
    user.external_id = None
    user.restore_quarantined, user.is_active = True, False
    user.local_enrollment_state = "enrolled"
    user.local_email_verified_at = utc_now()
    binding = await db_session.get(InstallationIdentity, 1)
    key = tmp_path / "signing-authority"
    key.write_text("test-only verified signing authority " * 4)
    key.chmod(0o600)
    settings = native_context.model_copy(
        update={"secret_key_file": str(key), "secret_key": key.read_text(), "local_mfa_policy": "optional"}
    )
    evidence = dict(
        version=1,
        status="ready",
        installation_id=binding.installation_id,
        epoch=str(uuid4()),
        signing_fingerprint=fingerprint(key.read_bytes()),
        manifest_digest="1" * 64,
        checkpoint_digest=None,
    )
    row = IdentityRestoreCutover(
        id=1, cutover_at=utc_now(), **{k: v for k, v in evidence.items() if k not in {"version", "status"}}
    )
    refresh = RefreshToken(
        user_id=user.id, jti=uuid4().hex, token_version=user.token_version, expires_at=utc_now() + timedelta(days=1)
    )
    db_session.add_all([row, refresh])
    await db_session.commit()
    marker = Path(str(key) + ".restore-state.json")
    marker.write_text(json.dumps(evidence))
    marker.chmod(0o600)
    payload = await review_module.review_status(db_session, settings, user.id)
    for field in ("restore_quarantined", "credential_recovery_pending"):
        payload.pop(field)
    payload.update(
        reason="Private operator verification narrative",
        reviewer="Private reviewer",
        incident_reference="Private incident reference",
    )
    review = review_module.AccessReview.model_validate(payload)
    result = await review_module.reconcile_user(db_session, settings, review)
    assert result["status"] == "access-reviewed"
    await db_session.refresh(refresh)
    assert refresh.revoked_at is not None
    records = list(
        (
            await db_session.scalars(
                select(ActivityLog).where(
                    ActivityLog.entity_id == user.id, ActivityLog.description == "identity_restore_access_reviewed"
                )
            )
        ).all()
    )
    streamed = [item for item in emitted if item["description"] == "identity_restore_access_reviewed"]
    assert len(records) == len(streamed) == 1
    for changes in [records[0].changes, streamed[0]["changes"]]:
        assert changes["event_type"] == "identity_restore_access_reviewed"
        assert changes["revoke_count"] == 1
        for private in (review.reason, review.reviewer, review.incident_reference, refresh.jti, settings.secret_key):
            assert private not in str(changes)


@pytest.mark.asyncio
async def test_authority_invalidation_counts_only_rows_changed_and_projects_safe_counts(
    db_session,
    test_user,
    test_user_employee,
    monkeypatch,
):
    from datetime import timedelta
    from uuid import uuid4

    from app.core.datetime_utils import utc_now
    from app.models import InstallationIdentity, LocalAuthGrant, RefreshToken
    from app.services._local_auth.common import audit_local

    binding = InstallationIdentity(auth_mode="password", establishment_source="pytest")
    db_session.add(binding)
    await db_session.flush()
    now = utc_now()
    grants = [
        LocalAuthGrant(
            user_id=test_user.id,
            installation_id=binding.installation_id,
            purpose=purpose,
            secret_hash="private-grant-hash",
            token_version=test_user.token_version,
            expires_at=now + timedelta(minutes=5),
        )
        for purpose in ["recent", "email", "mfa", "reset", "reset"]
    ]
    grants[-2].consumed_at, grants[-1].revoked_at = now, now
    other = LocalAuthGrant(
        user_id=test_user_employee.id,
        installation_id=binding.installation_id,
        purpose="reset",
        secret_hash="private-other-hash",
        token_version=test_user_employee.token_version,
        expires_at=now + timedelta(minutes=5),
    )
    refreshes = [
        RefreshToken(
            user_id=test_user.id,
            jti=uuid4().hex,
            token_version=test_user.token_version,
            expires_at=now + timedelta(days=1),
        )
        for _ in range(3)
    ]
    refreshes[-1].revoked_at = now
    db_session.add_all([*grants, other, *refreshes])
    await db_session.commit()
    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    counts = await invalidate_user_authority(db=db_session, user=test_user, reason="count_acceptance")
    assert (counts.revoke_count, counts.artifact_revoke_count) == (2, 3)
    await audit_local(
        db_session,
        test_user,
        "count_acceptance",
        revoke_count=counts.revoke_count,
        artifact_revoke_count=counts.artifact_revoke_count,
    )
    await db_session.commit()
    assert (await db_session.get(LocalAuthGrant, other.id, populate_existing=True)).revoked_at is None
    records = list(
        (await db_session.scalars(select(ActivityLog).where(ActivityLog.description == "count_acceptance"))).all()
    )
    streamed = [row for row in emitted if row["description"] == "count_acceptance"]
    assert len(records) == len(streamed) == 1
    for changes in [records[0].changes, streamed[0]["changes"]]:
        assert changes["revoke_count"] == 2 and changes["artifact_revoke_count"] == 3
        for secret in [g.secret_hash for g in grants] + [r.jti for r in refreshes]:
            assert secret not in str(changes)
    repeated = await invalidate_user_authority(db=db_session, user=test_user, reason="count_acceptance_repeat")
    assert (repeated.revoke_count, repeated.artifact_revoke_count) == (0, 0)
    assert await invalidate_user_sessions(db=db_session, user=test_user, reason="legacy_contract") == 0


@pytest.mark.parametrize("value", ["a-secret-value", {"grant": "private"}, True, -1])
def test_artifact_count_allowlist_never_discloses_non_numeric_values(value):
    from app.core.activity_redaction import REDACTED_VALUE, sanitize_changes

    result = sanitize_changes("user", {"artifact_revoke_count": value})
    assert result.changes == {"artifact_revoke_count": REDACTED_VALUE}
    assert not result.visible_fields


@pytest.mark.parametrize("value", [0, 3])
def test_artifact_count_projection_preserves_nonnegative_integers(value):
    from app.core.activity_redaction import sanitize_changes

    result = sanitize_changes("user", {"artifact_revoke_count": value})
    assert result.changes == {"artifact_revoke_count": value}
    assert result.visible_fields == ("artifact_revoke_count",)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["reset", "password", "email"])
async def test_credential_audit_counts_actual_pending_artifacts_without_secrets(
    credential_account,
    native_context,
    client_factory,
    db_session,
    monkeypatch,
    operation,
):
    from app.models import LocalAuthGrant, RefreshToken
    from tests.backend.pytest.test_local_credentials import BASE, NEW_EMAIL, NEW_PASSWORD, pending_email, request_reset
    from tests.backend.pytest.test_local_identity import login_password_only
    from tests.backend.pytest.test_local_recovery import recent

    uid = credential_account
    emitted = []
    monkeypatch.setattr(
        activity_logger, "audit_logger", SimpleNamespace(info=lambda event, **data: emitted.append(data))
    )
    async with client_factory(settings=native_context, headers={"Origin": "http://test"}) as client:
        await login_password_only(client, "journey@example.com")
        reset = await request_reset(client, db_session, native_context, uid)
        email = await pending_email(client, db_session, native_context, uid)
        spare = await recent(client, uid, None, "password_change", intended_password="Unused private passphrase 87!")
        proof = await recent(
            client,
            uid,
            None,
            "email_change" if operation == "email" else "password_change",
            **({"intended_email": NEW_EMAIL} if operation == "email" else {"intended_password": NEW_PASSWORD}),
        )
        if operation == "reset":
            path, body, event, consumed = (
                BASE + "/password/reset/complete",
                {"grant": reset, "password": NEW_PASSWORD},
                "local_password_reset_completed",
                1,
            )
        elif operation == "password":
            path, body, event, consumed = (
                BASE + "/password/change",
                {"recent_auth_proof": proof, "password": NEW_PASSWORD},
                "local_password_changed",
                1,
            )
        else:
            path, body, event, consumed = (
                BASE + "/email/confirm",
                {"grant": email, "recent_auth_proof": proof},
                "local_email_changed",
                2,
            )
        outstanding = list(
            (
                await db_session.scalars(
                    select(LocalAuthGrant).where(
                        LocalAuthGrant.user_id == uid,
                        LocalAuthGrant.revoked_at.is_(None),
                        LocalAuthGrant.consumed_at.is_(None),
                    )
                )
            ).all()
        )
        refreshes = list(
            (
                await db_session.scalars(
                    select(RefreshToken).where(RefreshToken.user_id == uid, RefreshToken.revoked_at.is_(None))
                )
            ).all()
        )
        expected = len(outstanding) - consumed
        assert expected >= 2 and len(refreshes) == 1
        result = await client.post(path, json=body)
        assert result.status_code == 200, result.text
        records = list((await db_session.scalars(select(ActivityLog).where(ActivityLog.description == event))).all())
        streamed = [row for row in emitted if row["description"] == event]
        assert len(records) == len(streamed) == 1
        for changes in [records[0].changes, streamed[0]["changes"]]:
            assert changes["artifact_revoke_count"] == expected
            assert changes["revoke_count"] == 1
            for secret in [reset, email, spare, proof, NEW_PASSWORD, NEW_EMAIL, *[g.secret_hash for g in outstanding]]:
                assert secret not in str(changes)
