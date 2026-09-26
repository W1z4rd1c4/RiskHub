"""Restore security proofs; a version increment cannot replace new signing authority."""

from pathlib import Path

import pytest
from jwt import InvalidTokenError

from app.core.config import Settings
from app.core.security import create_access_token, decode_access_token
from app.services._identity_restore.files import fingerprint, rotate_signing_authority


def test_restore_rejects_later_token_even_when_the_restored_version_collides(
    tmp_path: Path,
):
    signing_file = tmp_path / "secret_key"
    signing_file.write_text("pre-restore-signing-authority-" * 3)
    signing_file.chmod(0o600)
    settings = Settings(secret_key=signing_file.read_text())
    backup_version = 7
    later_token = create_access_token({"sub": "42", "token_version": backup_version + 1}, settings=settings)
    restored_version = backup_version + 1
    assert decode_access_token(later_token, settings=settings)["token_version"] == restored_version

    rotate_signing_authority(
        signing_file.resolve(),
        expected_fingerprint=fingerprint(signing_file.read_bytes()),
    )
    restored_settings = settings.model_copy(update={"secret_key": signing_file.read_text()})
    with pytest.raises(InvalidTokenError):
        decode_access_token(later_token, settings=restored_settings)


@pytest.mark.asyncio
async def test_unknown_security_freshness_quarantines_old_password(native_context, db_session, test_user_employee):
    from app.core.datetime_utils import utc_now
    from app.core.identity_policy import can_authenticate_user
    from app.core.security import get_password_hash
    from app.services._identity_restore.cutover import reconcile_restored_security

    user = test_user_employee
    user.local_enrollment_state = "enrolled"
    user.local_email_verified_at = utc_now()
    user.hashed_password = get_password_hash("A replaced backup password 45!")
    user.is_active = True
    await db_session.commit()
    settings = native_context.model_copy(update={"secret_key": "new-cutover-authority-" * 4})
    result = await reconcile_restored_security(
        db_session,
        settings,
        checkpoint=None,
        evidence_key=b"e" * 32,
        epoch="46f710ad-f003-4102-af1f-cbd1989f28f1",
        manifest_digest="1" * 64,
        checkpoint_digest=None,
        previous_signing_fingerprint="f" * 64,
        signing_fingerprint=fingerprint(settings.secret_key.encode()),
        source="test-restore",
    )
    await db_session.refresh(user)
    assert result["quarantined"] >= 1
    assert user.hashed_password is None
    assert user.restore_quarantined and user.local_recovery_pending
    assert not user.is_active
    user.is_active = True  # An unrelated status projection cannot admit this account.
    user.local_recovery_pending = False
    assert not can_authenticate_user(user, settings=settings)


@pytest.mark.asyncio
async def test_checkpoint_preserves_new_suspension_and_revokes_restored_artifacts(
    native_context, db_session, test_user_employee
):
    from datetime import timedelta

    from app.core.datetime_utils import utc_now
    from app.core.security import get_password_hash
    from app.models import (
        InstallationIdentity,
        LocalAuthDelivery,
        LocalAuthGrant,
        LocalAuthRecoveryCode,
        LocalBootstrapTarget,
        RefreshToken,
    )
    from app.services._identity_restore.checkpoint import capture_checkpoint
    from app.services._identity_restore.cutover import reconcile_restored_security

    now = utc_now()
    user = test_user_employee
    binding = await db_session.get(InstallationIdentity, 1)
    user.local_enrollment_state = "enrolled"
    user.local_email_verified_at = now
    user.hashed_password = get_password_hash("A checkpoint test password 83!")
    user.local_suspended = True
    user.local_suspended_at = now
    user.is_active = False
    user.token_version = 8
    await db_session.commit()
    checkpoint = await capture_checkpoint(
        db_session,
        native_context,
        source="current stopped installation",
        evidence_key=b"e" * 32,
    )
    native_context.local_mfa_policy = "optional"
    # The restored backup predates the current suspension and version.
    (
        user.local_suspended,
        user.local_suspended_at,
        user.is_active,
        user.token_version,
    ) = False, None, True, 7
    grant = LocalAuthGrant(
        user_id=user.id,
        installation_id=binding.installation_id,
        purpose="reset",
        secret_hash="a" * 64,
        token_version=7,
        expires_at=now + timedelta(hours=1),
        context={"pending_password": {"ciphertext": "obsolete"}},
    )
    db_session.add(grant)
    await db_session.flush()
    delivery = LocalAuthDelivery(
        user_id=user.id,
        installation_id=binding.installation_id,
        grant_id=grant.id,
        key_id="v1",
        ciphertext="obsolete-envelope",
        status="pending",
        expires_at=now + timedelta(hours=1),
    )
    code = LocalAuthRecoveryCode(user_id=user.id, factor_generation="f" * 32, digest="b" * 64)
    refresh = RefreshToken(
        user_id=user.id,
        jti="restored-refresh",
        token_version=7,
        expires_at=now + timedelta(hours=1),
    )
    db_session.add_all([delivery, code, refresh])
    await db_session.flush()
    bootstrap = LocalBootstrapTarget(
        installation_id=binding.installation_id,
        slot="admin",
        user_id=user.id,
        initial_email=user.email,
        delivery_id=delivery.id,
        handoff_path="/protected/old-handoff.json",
        completed_at=now,
    )
    db_session.add(bootstrap)
    await db_session.commit()
    settings = native_context.model_copy(update={"secret_key": "new-cutover-authority-" * 4})
    await reconcile_restored_security(
        db_session,
        settings,
        checkpoint=checkpoint,
        evidence_key=b"e" * 32,
        epoch="46f710ad-f003-4102-af1f-cbd1989f28f1",
        manifest_digest="1" * 64,
        checkpoint_digest="2" * 64,
        previous_signing_fingerprint="f" * 64,
        signing_fingerprint=fingerprint(settings.secret_key.encode()),
        source="planned restore",
    )
    for row in (user, grant, delivery, code, refresh):
        await db_session.refresh(row)
    assert user.local_suspended and not user.is_active
    assert not user.restore_quarantined
    assert user.token_version == 9
    assert user.hashed_password is not None
    assert grant.revoked_at is not None and grant.context == {}
    assert delivery.ciphertext is None and delivery.status == "cancelled"
    assert code.consumed_at is not None
    assert refresh.revoked_at is not None
    await db_session.refresh(bootstrap)
    assert bootstrap.completed_at is not None


@pytest.mark.asyncio
async def test_restored_factor_cutoff_and_changed_credentials_require_recovery(
    native_context, db_session, test_user_employee
):
    import pyotp

    from app.core.datetime_utils import utc_now
    from app.core.security import get_password_hash
    from app.models import InstallationIdentity, LocalAuthFactor
    from app.services._identity_restore.checkpoint import capture_checkpoint
    from app.services._identity_restore.cutover import reconcile_restored_security
    from app.services._local_auth.keys import LocalKeyring

    user = test_user_employee
    binding = await db_session.get(InstallationIdentity, 1)
    keys = LocalKeyring.load(native_context.local_auth_keyring_file)
    seed = pyotp.random_base32()
    key_id, encrypted = keys.encrypt("totp", seed, [binding.installation_id, str(user.id), "a" * 32])
    factor = LocalAuthFactor(
        user_id=user.id,
        generation="a" * 32,
        key_id=key_id,
        encrypted_seed=encrypted,
        confirmed_at=utc_now(),
        last_time_step=-1,
    )
    user.local_enrollment_state = "enrolled"
    user.local_email_verified_at = utc_now()
    user.hashed_password = get_password_hash("The newer secure password 47!")
    db_session.add(factor)
    await db_session.commit()
    checkpoint = await capture_checkpoint(db_session, native_context, source="current", evidence_key=b"e" * 32)
    settings = native_context.model_copy(update={"secret_key": "fresh signing key " * 5})
    kwargs = dict(
        checkpoint=checkpoint,
        evidence_key=b"e" * 32,
        epoch="test",
        manifest_digest="1" * 64,
        checkpoint_digest="2" * 64,
        previous_signing_fingerprint="3" * 64,
        signing_fingerprint=fingerprint(settings.secret_key.encode()),
        source="test",
    )
    await reconcile_restored_security(db_session, settings, **kwargs)
    await db_session.refresh(factor)
    assert factor.last_time_step >= int(utc_now().timestamp()) // 30
    assert (
        keys.decrypt(
            "totp", factor.key_id, factor.encrypted_seed, [binding.installation_id, str(user.id), factor.generation]
        )
        == seed
    )
    user.hashed_password = get_password_hash("An obsolete restored password 35!")
    await db_session.commit()
    await reconcile_restored_security(db_session, settings, **kwargs)
    assert user.restore_quarantined and user.hashed_password is None
    assert await db_session.get(LocalAuthFactor, user.id) is None


@pytest.mark.asyncio
async def test_cutover_admission_rejects_interrupted_missing_or_stale_evidence(native_context, db_session, tmp_path):
    import json

    from app.core.datetime_utils import utc_now
    from app.models import IdentityRestoreCutover, InstallationIdentity
    from app.services._identity_restore.admission import validate_restore_admission
    from app.services.identity_installation import IdentityBindingError

    binding = await db_session.get(InstallationIdentity, 1)
    key = tmp_path / "signing-key"
    key.write_text("signing authority " * 5)
    key.chmod(0o600)
    settings = native_context.model_copy(update={"secret_key_file": str(key), "secret_key": key.read_text()})
    row = IdentityRestoreCutover(
        id=1,
        installation_id=binding.installation_id,
        epoch="test-epoch",
        signing_fingerprint=fingerprint(key.read_bytes()),
        manifest_digest="1" * 64,
        checkpoint_digest=None,
        cutover_at=utc_now(),
    )
    db_session.add(row)
    await db_session.commit()
    with pytest.raises(IdentityBindingError):
        await validate_restore_admission(db_session, settings=settings)
    marker = Path(str(key) + ".restore-state.json")
    payload = dict(
        version=1,
        installation_id=binding.installation_id,
        epoch=row.epoch,
        signing_fingerprint=row.signing_fingerprint,
        manifest_digest=row.manifest_digest,
        checkpoint_digest=None,
        status="pending",
    )
    marker.write_text(json.dumps(payload))
    marker.chmod(0o600)
    with pytest.raises(IdentityBindingError):
        await validate_restore_admission(db_session, settings=settings)
    payload["status"] = "ready"
    marker.write_text(json.dumps(payload))
    await validate_restore_admission(db_session, settings=settings)
    with pytest.raises(IdentityBindingError):
        await validate_restore_admission(db_session, settings=settings.model_copy(update={"secret_key": "old" * 40}))


@pytest.mark.asyncio
async def test_restore_purges_only_owned_redis_authentication_state():
    import fakeredis.aioredis

    from app.services._identity_restore.cutover import purge_installation_auth

    owned = "12345678-1234-1234-1234-123456789012"
    redis = fakeredis.aioredis.FakeRedis()
    try:
        await redis.set(f"riskhub:{owned}:local-auth:challenge:one", "obsolete")
        await redis.set("other-application:session", "preserve")
        await redis.set("riskhub:other-installation:local-auth:challenge:one", "preserve")
        assert await purge_installation_auth(redis, owned) == 1
        assert await redis.get("other-application:session") == b"preserve"
        assert await redis.get("riskhub:other-installation:local-auth:challenge:one") == b"preserve"
    finally:
        await redis.aclose()


@pytest.mark.asyncio
@pytest.mark.postgres
@pytest.mark.parametrize("upstream_state", ["enabled", "disabled", "changed-during-fetch"])
async def test_directory_review_fetches_before_user_lock_and_rechecks_authority(
    native_context,
    db_session,
    async_engine,
    test_user,
    tmp_path,
    monkeypatch,
    upstream_state,
):
    """Component Graph contract only; no real Entra tenant is used or claimed."""
    import json
    from datetime import timedelta
    from types import SimpleNamespace
    from uuid import uuid4

    from sqlalchemy import text, update
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.datetime_utils import utc_now
    from app.models import IdentityRestoreCutover, InstallationIdentity, RefreshToken, User
    from app.services._identity_restore import review as review_module
    from app.services._identity_restore.files import RestoreError
    from tests.backend.pytest.test_identity_foundations_postgres import require_postgres

    require_postgres(async_engine)
    user = test_user
    user.external_id = str(uuid4())
    user.restore_quarantined, user.is_active = True, False
    binding = await db_session.get(InstallationIdentity, 1)
    binding.auth_mode, binding.tenant_id = "microsoft_sso", str(uuid4())
    key = tmp_path / "signing-key"
    key.write_text("verified signing authority " * 4)
    key.chmod(0o600)
    settings = native_context.model_copy(
        update={
            "auth_mode": "microsoft_sso",
            "directory_provider": "graph",
            "entra_tenant_id": binding.tenant_id,
            "secret_key_file": str(key),
            "secret_key": key.read_text(),
        }
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
        reason="Reviewed current external eligibility and access",
        reviewer="Incident reviewer",
        incident_reference="INC-restore-contract",
    )
    review = review_module.AccessReview.model_validate(payload)

    async def current_upstream(_service, subject):
        assert subject == user.external_id
        locks = await db_session.scalar(
            text(
                "SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid() "
                "AND relation='users'::regclass AND mode IN ('RowShareLock','RowExclusiveLock')"
            )
        )
        assert locks == 0, "Remote directory fetch must precede the User critical section"
        if upstream_state == "changed-during-fetch":
            async with AsyncSession(async_engine) as other:
                await other.execute(update(User).where(User.id == user.id).values(token_version=User.token_version + 1))
                await other.commit()
        return SimpleNamespace(external_id=subject, account_enabled=upstream_state != "disabled")

    monkeypatch.setattr(review_module.GraphDirectoryService, "get_user", current_upstream)
    if upstream_state != "enabled":
        with pytest.raises(RestoreError):
            await review_module.reconcile_user(db_session, settings, review)
        await db_session.rollback()
        await db_session.refresh(user)
        assert user.restore_quarantined and not user.is_active
    else:
        result = await review_module.reconcile_user(db_session, settings, review)
        await db_session.refresh(refresh)
        assert result["active"] and not user.restore_quarantined
        assert user.token_version == review.expected_token_version + 1
        assert refresh.revoked_reason == "identity_restore_access_review"
