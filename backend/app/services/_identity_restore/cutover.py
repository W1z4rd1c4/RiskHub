"""Reconcile restored authorization and revoke all pre-cutover authentication state."""

from __future__ import annotations

import hmac
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.identity_policy import projected_account_active
from app.models import (
    Department,
    IdentityRestoreCutover,
    LocalAuthDelivery,
    LocalAuthFactor,
    LocalAuthGrant,
    LocalAuthRecoveryCode,
    LocalBootstrapTarget,
    OutboxEvent,
    RefreshToken,
    User,
)
from app.models.user import AccessScope
from app.services._auth_session_workflow.transactions import commit_auth_transaction
from app.services._local_auth.common import audit_local
from app.services._local_auth.keys import LocalKeyring
from app.services.identity_installation import validate_installation_binding

from .checkpoint import SecurityCheckpoint, credential_commitment, role_digests
from .files import RestoreError, fingerprint
from .ownership import ownership_digest


def parse_instant(value: str | None) -> datetime | None:
    if value is None:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise RestoreError("Checkpoint timestamps must carry their UTC offset")
    return coerce_utc(parsed)


async def purge_installation_auth(redis, installation_id: str) -> int:
    """Only native-auth keys owned by this installation; SSO is also rekeyed at startup."""
    if str(UUID(installation_id)) != installation_id:
        raise RestoreError("Noncanonical installation identity")
    removed = 0
    pending = []
    async for key in redis.scan_iter(match=f"riskhub:{installation_id}:local-auth:*", count=200):
        pending.append(key)
        if len(pending) == 200:
            removed += await redis.delete(*pending)
            pending.clear()
    if pending:
        removed += await redis.delete(*pending)
    return removed


async def reconcile_restored_security(
    db: AsyncSession,
    settings: Settings,
    *,
    checkpoint: SecurityCheckpoint | None,
    evidence_key: bytes,
    epoch: str,
    manifest_digest: str,
    checkpoint_digest: str | None,
    signing_fingerprint: str,
    previous_signing_fingerprint: str,
    source: str,
) -> dict[str, int]:
    """Caller holds maintenance and has replaced signing authority before this transaction."""
    binding = await validate_installation_binding(db, settings=settings)
    if (
        fingerprint(settings.secret_key.encode()) != signing_fingerprint
        or signing_fingerprint == previous_signing_fingerprint
    ):
        raise RestoreError("The active signing file does not match this cutover")
    if checkpoint is not None and (
        checkpoint.kind != "security-checkpoint"
        or checkpoint.installation_id != binding.installation_id
        or checkpoint.auth_mode != binding.auth_mode
        or checkpoint.tenant_id != binding.tenant_id
        or len({entry.id for entry in checkpoint.users}) != len(checkpoint.users)
    ):
        raise RestoreError("Checkpoint identity or account mapping differs from the destination")
    current = {entry.id: entry for entry in checkpoint.users} if checkpoint else {}
    roles = await role_digests(db)
    ownership_matches = checkpoint is not None and checkpoint.ownership_digest == await ownership_digest(db)
    keys = LocalKeyring.load(settings.local_auth_keyring_file) if binding.auth_mode == "password" else None
    now = utc_now()
    cutoff_step = int(now.timestamp()) // 30
    users = list(await db.scalars(select(User).order_by(User.id).with_for_update()))
    restored_ids = {user.id for user in users}
    departments = set(await db.scalars(select(Department.id)))
    factors = {factor.user_id: factor for factor in await db.scalars(select(LocalAuthFactor).with_for_update())}
    quarantined = 0
    for user in users:
        state = current.get(user.id)
        factor = factors.get(user.id)
        known_identity = state is not None and state.external_id == user.external_id
        known_access = bool(
            known_identity
            and ownership_matches
            and state is not None
            and roles.get(state.role_id) == state.role_digest
            and (state.manager_id is None or state.manager_id in restored_ids)
            and (state.department_id is None or state.department_id in departments)
        )
        known_credentials = bool(
            known_identity
            and state is not None
            and hmac.compare_digest(
                credential_commitment(
                    user, factor, installation_id=binding.installation_id, keys=keys, evidence_key=evidence_key
                ),
                state.credential_commitment,
            )
        )
        if known_access and state is not None:
            user.role_id = state.role_id
            user.access_scope = AccessScope(state.access_scope)
            user.department_id, user.manager_id = state.department_id, state.manager_id
            user.local_suspended, user.local_suspended_at = (
                state.local_suspended,
                parse_instant(state.local_suspended_at),
            )
            user.local_recovery_pending = state.local_recovery_pending
            if known_credentials:
                user.local_enrollment_state = state.local_enrollment_state
            user.directory_sync_status = state.directory_sync_status
            user.deprovision_reason, user.deprovisioned_at = (
                state.deprovision_reason,
                parse_instant(state.deprovisioned_at),
            )
        # Entra must also establish current upstream eligibility during explicit
        # user reconciliation. Old break-glass grants never survive cutover.
        user.break_glass_expires_at = None
        user.break_glass_reason = None
        user.break_glass_granted_by_user_id = None
        user.restore_quarantined = bool(
            not known_access
            or not known_credentials
            or user.external_id is not None
            or (state is not None and state.restore_quarantined)
        )
        if user.restore_quarantined:
            quarantined += 1
        if not known_credentials and user.external_id is None:
            user.hashed_password = None
            user.local_recovery_pending = True
            if factor is not None:
                await db.delete(factor)
                factor = None
        if factor is not None:
            factor.last_time_step = max(
                factor.last_time_step, cutoff_step, state.factor_last_step or -1 if state else -1
            )
        user.token_version = max(user.token_version, state.token_version if state else 0) + 1
        user.is_active = bool(
            state is not None and state.is_active and projected_account_active(user, settings=settings)
        )
        await audit_local(
            db,
            user,
            "identity_restore_user_reconciled",
            evidence={
                "restore_epoch": epoch,
                "restore_quarantined": user.restore_quarantined,
                "checkpoint_matched": known_access and known_credentials,
                "source": source,
            },
        )
    # Pending secret-bearing contexts and all delivery envelopes belong to the old
    # authority even when their expiry lies in the future.
    await db.execute(update(LocalAuthGrant).values(revoked_at=now, context={}, browser_hash=None))
    await db.execute(update(LocalAuthDelivery).values(status="cancelled", ciphertext=None))
    await db.execute(update(LocalAuthRecoveryCode).values(consumed_at=now))
    await db.execute(update(RefreshToken).values(revoked_at=now, revoked_reason="identity_restore_cutover"))
    await db.execute(
        update(OutboxEvent)
        .where(OutboxEvent.event_type == "local_auth.deliver")
        .values(
            status="processed",
            processed_at=now,
            locked_at=None,
            locked_by=None,
            last_error=None,
        )
    )
    # Completion is irreversible even when an older dump retained an incomplete marker.
    await db.execute(
        update(LocalBootstrapTarget).where(LocalBootstrapTarget.completed_at.is_(None)).values(completed_at=now)
    )
    cutover = await db.get(IdentityRestoreCutover, 1, with_for_update=True)
    if cutover is None:
        cutover = IdentityRestoreCutover(id=1)
        db.add(cutover)
    cutover.installation_id, cutover.epoch = binding.installation_id, epoch
    cutover.signing_fingerprint, cutover.manifest_digest = signing_fingerprint, manifest_digest
    cutover.checkpoint_digest, cutover.cutover_at = checkpoint_digest, now
    await commit_auth_transaction(db, boundary="identity_restore_cutover")
    return {"users": len(users), "quarantined": quarantined, "reconciled": len(users) - quarantined}
