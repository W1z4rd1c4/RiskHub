"""Replace confirmed factors without destroying a working factor during setup."""

from __future__ import annotations

import secrets
from typing import Literal
from uuid import uuid4

import pyotp
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.exceptions import ServiceFailure
from app.models import LocalAuthFactor, LocalAuthGrant, LocalAuthRecoveryCode, User
from app.schemas.local_auth import FactorEnrollmentResponse, FactorSetupResponse
from app.services._auth_session_workflow.authority import invalidate_user_sessions

from .artifacts import consume_grant, failed_factor, issue_grant, read_grant, revoke_grants
from .common import NativeContext, atomic_local_work, audit_local, commit_local, invalid_proof, local_user_ready
from .delivery import enqueue_mail
from .factors import check_recent_proof, factor_limits, match_totp_step, recovery_digest


def pending_factor(ctx: NativeContext, user: User) -> tuple[dict, str]:
    generation, seed = uuid4().hex, pyotp.random_base32()
    key_id, ciphertext = ctx.keys.encrypt("totp", seed, [ctx.installation_id, str(user.id), generation])
    return {"generation": generation, "key_id": key_id, "ciphertext": ciphertext}, seed


def factor_from_pending(user: User, context: dict) -> LocalAuthFactor:
    value = context["pending_factor"]
    return LocalAuthFactor(
        user_id=user.id,
        generation=value["generation"],
        key_id=value["key_id"],
        encrypted_seed=value["ciphertext"],
        last_time_step=-1,
    )


async def replace_recovery_codes(db: AsyncSession, ctx: NativeContext, user: User, generation: str) -> list[str]:
    await db.execute(delete(LocalAuthRecoveryCode).where(LocalAuthRecoveryCode.user_id == user.id))
    codes = [secrets.token_urlsafe(16) for _ in range(10)]
    db.add_all(
        [
            LocalAuthRecoveryCode(
                user_id=user.id, factor_generation=generation, digest=recovery_digest(ctx, user.id, generation, code)
            )
            for code in codes
        ]
    )
    return codes


async def queue_security_notice(db: AsyncSession, ctx: NativeContext, user: User) -> Literal["pending", "failed"]:
    try:
        async with db.begin_nested():
            await enqueue_mail(db, ctx, user, recipient=user.email, kind="credentials_changed")
    except ServiceFailure:
        await audit_local(db, user, "local_security_notice_unavailable")
        return "failed"
    return "pending"


async def begin_replacement(
    db: AsyncSession, ctx: NativeContext, actor: User, *, proof: str, browser: str
) -> FactorSetupResponse:
    await factor_limits(ctx, actor.id)
    async with atomic_local_work(db):
        recent, user = await check_recent_proof(
            db, ctx, actor, raw=proof, operation="factor_replace", value="factor_replace", browser=browser
        )
        factor = await db.get(LocalAuthFactor, user.id, populate_existing=True)
        if factor is None or factor.confirmed_at is None:
            raise invalid_proof()
        await consume_grant(db, recent)
        await revoke_grants(db, user.id, purpose="replacement")
        pending, seed = pending_factor(ctx, user)
        _, raw = await issue_grant(
            db,
            ctx,
            user,
            "replacement",
            300,
            browser=browser,
            generation=factor.generation,
            context={"pending_factor": pending},
        )
        await audit_local(db, user, "local_factor_replacement_started", actor=user)
        await commit_local(db, "replacement_started")
        return FactorSetupResponse(
            challenge=raw, provisioning_uri=pyotp.TOTP(seed).provisioning_uri(name=user.email, issuer_name="RiskHub")
        )


async def confirm_pending_factor(
    db: AsyncSession, ctx: NativeContext, user: User, grant: LocalAuthGrant, *, code: str, method: str
) -> LocalAuthFactor:
    pending = factor_from_pending(user, grant.context)
    # Verification only: do not attach the temporary object to the session.
    if method != "totp" or len(code) != 6 or not code.isascii() or not code.isdigit():
        await failed_factor(db, grant, user)
    seed = ctx.keys.decrypt(
        "totp", pending.key_id, pending.encrypted_seed, [ctx.installation_id, str(user.id), pending.generation]
    )
    matched_step = match_totp_step(seed, code)
    if matched_step is None:
        await failed_factor(db, grant, user)
        raise invalid_proof()
    active = await db.get(LocalAuthFactor, user.id, populate_existing=True)
    if active is None:
        active = LocalAuthFactor(user_id=user.id)
        db.add(active)
    active.generation, active.key_id = pending.generation, pending.key_id
    active.encrypted_seed = pending.encrypted_seed
    active.confirmed_at, active.setup_expires_at = utc_now(), None
    active.last_time_step = matched_step
    return active


async def complete_replacement(
    db: AsyncSession, ctx: NativeContext, *, raw: str, browser: str, code: str, method: str
) -> FactorEnrollmentResponse:
    async with atomic_local_work(db):
        _, user = await read_grant(db, ctx, raw, "replacement", browser=browser)
        await factor_limits(ctx, user.id)
        grant, user = await read_grant(db, ctx, raw, "replacement", browser=browser, locked=True)
        factor = await db.get(LocalAuthFactor, user.id, populate_existing=True)
        if (
            not local_user_ready(user)
            or not user.role.is_active
            or factor is None
            or factor.confirmed_at is None
            or factor.generation != grant.factor_generation
        ):
            raise invalid_proof()
        active = await confirm_pending_factor(db, ctx, user, grant, code=code, method=method)
        await consume_grant(db, grant)
        codes = await replace_recovery_codes(db, ctx, user, active.generation)
        await invalidate_user_sessions(db=db, user=user, reason="local_factor_replaced")
        await audit_local(db, user, "local_factor_replaced", actor=user)
        notification = await queue_security_notice(db, ctx, user)
        await commit_local(db, "factor_replaced")
        return FactorEnrollmentResponse(recovery_codes=codes, notification_status=notification)


async def regenerate_codes(
    db: AsyncSession, ctx: NativeContext, actor: User, *, proof: str, browser: str
) -> FactorEnrollmentResponse:
    await factor_limits(ctx, actor.id)
    async with atomic_local_work(db):
        grant, user = await check_recent_proof(
            db, ctx, actor, raw=proof, operation="recovery_codes", value="recovery_codes", browser=browser
        )
        factor = await db.get(LocalAuthFactor, user.id, populate_existing=True)
        if factor is None or factor.confirmed_at is None:
            raise invalid_proof()
        await consume_grant(db, grant)
        codes = await replace_recovery_codes(db, ctx, user, factor.generation)
        await invalidate_user_sessions(db=db, user=user, reason="local_recovery_codes_replaced")
        await audit_local(db, user, "local_recovery_codes_replaced", actor=user)
        notification = await queue_security_notice(db, ctx, user)
        await commit_local(db, "recovery_codes_replaced")
        return FactorEnrollmentResponse(recovery_codes=codes, notification_status=notification)
