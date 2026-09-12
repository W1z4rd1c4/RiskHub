"""Bounded assisted recovery. Ordinary sessions remain denied until confirmation."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc, utc_now
from app.core.email import email_equals, normalize_email
from app.core.password_policy import run_password_work, validate_local_password
from app.core.security import get_password_hash, verify_password_or_dummy
from app.models import LocalAuthGrant, User
from app.schemas.local_auth import (
    AssistedRecoveryRequest,
    FactorEnrollmentResponse,
    FactorSetupResponse,
    RecoveryStartRequest,
)
from app.services._auth_session_workflow.authority import invalidate_user_sessions
from app.services._identity_authority_lock import lock_identity_transition

from .artifacts import consume_grant, issue_grant, read_grant
from .common import NativeContext, atomic_local_work, audit_local, commit_local, invalid_proof
from .delivery import enqueue_mail
from .factor_management import confirm_pending_factor, pending_factor, queue_security_notice, replace_recovery_codes
from .factors import check_recent_proof, factor_limits
from .recovery_policy import recovery_intent, require_recoverable, require_recovery_actor


async def initiate_recovery(
    db: AsyncSession,
    ctx: NativeContext,
    user: User,
    *,
    operation: str,
    version: int,
    incident: str,
    verification: str,
    reason: str,
    approvers: list[str],
    actor: User | None = None,
    nonce: str | None = None,
    new_email: str | None = None,
    expires_at: datetime | None = None,
) -> tuple[LocalAuthGrant, str]:
    """Caller holds the administration and User locks and has verified approvals."""
    require_recoverable(user, version=version, web=actor is not None)
    if operation not in {"factor_recovery", "credential_and_factor_recovery", "verified_address_recovery"}:
        raise invalid_proof()
    address = normalize_email(new_email) if new_email else None
    if (operation == "verified_address_recovery") != (address is not None):
        raise invalid_proof()
    if address and (
        address == user.email
        or (
            await db.execute(select(User.id).where(email_equals(User.email, address), User.id != user.id))
        ).scalar_one_or_none()
        is not None
    ):
        raise invalid_proof()
    if nonce is not None and await db.get(LocalAuthGrant, nonce) is not None:
        raise invalid_proof()
    user.local_recovery_pending, user.is_active = True, False
    await invalidate_user_sessions(db=db, user=user, reason="local_recovery_started")
    grant, raw = await issue_grant(
        db,
        ctx,
        user,
        "recovery",
        900,
        grant_id=nonce,
        context={
            "operation": operation,
            "incident": incident,
            "verification": verification,
            "reason": reason,
            "approvers": approvers,
            "approved_version": version,
            "new_email": address,
            "old_email": user.email,
        },
    )
    if expires_at is not None:
        grant.expires_at = min(grant.expires_at, expires_at)
    if address:
        verification_grant, email_raw = await issue_grant(
            db,
            ctx,
            user,
            "recovery_email",
            900,
            context={"recovery_id": grant.id, "email": address},
        )
        verification_grant.expires_at = grant.expires_at
        await enqueue_mail(
            db, ctx, user, recipient=address, kind="recovery_email", grant=verification_grant, credential=email_raw
        )
    await audit_local(
        db,
        user,
        "local_recovery_started",
        actor=actor,
        reason=reason,
        evidence={
            "incident_reference": incident,
            "verification_method": verification,
            "approvers": approvers,
            "approved_version": version,
            "operation": operation,
        },
    )
    await queue_security_notice(db, ctx, user)
    return grant, raw


async def assisted_recovery(
    db: AsyncSession,
    ctx: NativeContext,
    actor: User,
    *,
    target_id: int,
    data: AssistedRecoveryRequest,
    browser: str,
) -> None:
    require_recovery_actor(actor)
    await ctx.limiter.require("recovery-actor", str(actor.id), 5, 3600)
    async with atomic_local_work(db):
        user = await lock_identity_transition(db, user_id=target_id, actor=actor)
        require_recovery_actor(actor)
        require_recoverable(user, version=data.expected_token_version, web=True)
        grant, _ = await check_recent_proof(
            db,
            ctx,
            actor,
            raw=data.recent_auth_proof.get_secret_value(),
            operation="assisted_recovery",
            value=recovery_intent(
                data.operation, data.expected_token_version, str(data.new_email) if data.new_email else None
            ),
            browser=browser,
            target_user_id=target_id,
        )
        await consume_grant(db, grant)
        recovery_grant, raw = await initiate_recovery(
            db,
            ctx,
            user,
            operation=data.operation,
            version=data.expected_token_version,
            incident=data.incident_reference,
            verification=data.verification_method,
            reason=data.reason,
            approvers=[],
            actor=actor,
            new_email=str(data.new_email) if data.new_email else None,
        )
        await enqueue_mail(
            db,
            ctx,
            user,
            recipient=str(data.new_email or user.email),
            kind="recovery",
            grant=recovery_grant,
            credential=raw,
        )
        await commit_local(db, "assisted_recovery")


def require_pending(user: User) -> None:
    if (
        not user.local_recovery_pending
        or user.local_suspended
        or user.external_id is not None
        or user.local_enrollment_state != "enrolled"
        or not user.role.is_active
    ):
        raise invalid_proof()


async def start_recovery(
    db: AsyncSession, ctx: NativeContext, data: RecoveryStartRequest, *, browser: str
) -> FactorSetupResponse:
    await ctx.limiter.require("redeem-source", ctx.source, 10, 900)
    async with atomic_local_work(db):
        grant, user = await read_grant(db, ctx, data.grant.get_secret_value(), "recovery")
        require_pending(user)
        operation, original_hash = grant.context["operation"], user.hashed_password
        new_hash = None
        if operation == "credential_and_factor_recovery":
            if data.new_password is None or data.current_password is not None:
                raise invalid_proof()
            password = data.new_password.get_secret_value()
            validate_local_password(password, additions_file=ctx.settings.local_password_blocklist_file)
            new_hash = await run_password_work(lambda: get_password_hash(password))
        else:
            if data.current_password is None or data.new_password is not None:
                raise invalid_proof()
            account = user.email
            if await ctx.limiter.password_locked(account):
                raise invalid_proof()
            current_password = data.current_password.get_secret_value()
            valid = await run_password_work(lambda: verify_password_or_dummy(current_password, original_hash))
            if not valid:
                await ctx.limiter.password_failed(account)
                raise invalid_proof()
        grant, user = await read_grant(db, ctx, data.grant.get_secret_value(), "recovery", locked=True)
        require_pending(user)
        if user.hashed_password != original_hash or user.email != grant.context["old_email"]:
            raise invalid_proof()
        if operation == "verified_address_recovery":
            if data.verified_email_grant is None:
                raise invalid_proof()
            email_grant, _ = await read_grant(
                db,
                ctx,
                data.verified_email_grant.get_secret_value(),
                "recovery_email",
                locked=True,
                expected_user_id=user.id,
            )
            if email_grant.context != {"recovery_id": grant.id, "email": grant.context["new_email"]}:
                raise invalid_proof()
            await consume_grant(db, email_grant)
        elif data.verified_email_grant is not None:
            raise invalid_proof()
        pending, seed = pending_factor(ctx, user)
        context = {**grant.context, "pending_factor": pending, "recovery_id": grant.id}
        if new_hash is not None:
            key_id, encrypted = ctx.keys.encrypt(
                "delivery", new_hash, [ctx.installation_id, str(user.id), grant.id, "recovery-password"]
            )
            context["pending_password"] = {"key_id": key_id, "ciphertext": encrypted}
        challenge, raw = await issue_grant(db, ctx, user, "recovery_setup", 300, browser=browser, context=context)
        challenge.expires_at = min(coerce_utc(grant.expires_at) or utc_now(), utc_now() + timedelta(seconds=300))
        await consume_grant(db, grant)
        await audit_local(db, user, "local_recovery_enrollment_started")
        await commit_local(db, "recovery_setup")
        import pyotp

        return FactorSetupResponse(
            challenge=raw, provisioning_uri=pyotp.TOTP(seed).provisioning_uri(name=user.email, issuer_name="RiskHub")
        )


async def complete_recovery(
    db: AsyncSession, ctx: NativeContext, *, raw: str, browser: str, code: str, method: str
) -> FactorEnrollmentResponse:
    async with atomic_local_work(db):
        _, user = await read_grant(db, ctx, raw, "recovery_setup", browser=browser)
        await factor_limits(ctx, user.id)
        grant, user = await read_grant(db, ctx, raw, "recovery_setup", browser=browser, locked=True)
        require_pending(user)
        if user.email != grant.context["old_email"]:
            raise invalid_proof()
        active = await confirm_pending_factor(db, ctx, user, grant, code=code, method=method)
        await consume_grant(db, grant)
        operation = grant.context["operation"]
        if operation == "credential_and_factor_recovery":
            pending = grant.context["pending_password"]
            user.hashed_password = ctx.keys.decrypt(
                "delivery",
                pending["key_id"],
                pending["ciphertext"],
                [ctx.installation_id, str(user.id), grant.context["recovery_id"], "recovery-password"],
            )
        elif operation == "verified_address_recovery":
            address = grant.context["new_email"]
            if (
                await db.execute(select(User.id).where(email_equals(User.email, address), User.id != user.id))
            ).scalar_one_or_none():
                raise invalid_proof()
            user.email, user.local_email_verified_at = address, utc_now()
        user.local_recovery_pending, user.is_active = False, True
        codes = await replace_recovery_codes(db, ctx, user, active.generation)
        await invalidate_user_sessions(db=db, user=user, reason="local_recovery_completed")
        await audit_local(
            db,
            user,
            "local_recovery_completed",
            evidence={
                "incident_reference": grant.context["incident"],
                "approvers": grant.context["approvers"],
                "approved_version": grant.context["approved_version"],
                "operation": operation,
            },
        )
        notification = await queue_security_notice(db, ctx, user)
        await commit_local(db, "recovery_completed")
        return FactorEnrollmentResponse(recovery_codes=codes, notification_status=notification)
