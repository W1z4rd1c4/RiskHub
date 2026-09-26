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
    later_token = create_access_token(
        {"sub": "42", "token_version": backup_version + 1}, settings=settings
    )
    restored_version = backup_version + 1
    assert (
        decode_access_token(later_token, settings=settings)["token_version"]
        == restored_version
    )

    rotate_signing_authority(
        signing_file.resolve(),
        expected_fingerprint=fingerprint(signing_file.read_bytes()),
    )
    restored_settings = settings.model_copy(
        update={"secret_key": signing_file.read_text()}
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(later_token, settings=restored_settings)


@pytest.mark.asyncio
async def test_unknown_security_freshness_quarantines_old_password(
    native_context, db_session, test_user_employee
):
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
    settings = native_context.model_copy(
        update={"secret_key": "new-cutover-authority-" * 4}
    )
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
    code = LocalAuthRecoveryCode(
        user_id=user.id, factor_generation="f" * 32, digest="b" * 64
    )
    refresh = RefreshToken(
        user_id=user.id,
        jti="restored-refresh",
        token_version=7,
        expires_at=now + timedelta(hours=1),
    )
    db_session.add_all([delivery, code, refresh])
    await db_session.commit()
    settings = native_context.model_copy(
        update={"secret_key": "new-cutover-authority-" * 4}
    )
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
