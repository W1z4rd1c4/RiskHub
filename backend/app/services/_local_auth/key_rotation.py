"""Bounded, User-locked re-encryption of native secrets and key-reference inventory."""

from copy import deepcopy

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import LocalAuthDelivery, LocalAuthFactor, LocalAuthGrant, User
from app.services._auth_session_workflow.authority import lock_session_user

from .common import NativeContext, audit_local, commit_local


def active_grants():
    return (
        LocalAuthGrant.consumed_at.is_(None),
        LocalAuthGrant.revoked_at.is_(None),
        LocalAuthGrant.expires_at > utc_now(),
    )


async def reference_counts(db: AsyncSession) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {purpose: {} for purpose in ("totp", "delivery", "action")}

    def add(purpose: str, key: str) -> None:
        counts[purpose][key] = counts[purpose].get(key, 0) + 1

    for key in (await db.scalars(select(LocalAuthFactor.key_id))).all():
        add("totp", key)
    for key in (
        await db.scalars(select(LocalAuthDelivery.key_id).where(LocalAuthDelivery.ciphertext.is_not(None)))
    ).all():
        add("delivery", key)
    for context in (await db.scalars(select(LocalAuthGrant.context).where(*active_grants()))).all():
        for field, purpose in (("pending_factor", "totp"), ("pending_password", "delivery")):
            if field in context:
                add(purpose, context[field]["key_id"])
        if "intent_key" in context:
            add("action", context["intent_key"])
    return counts


async def reencrypt_batch(db: AsyncSession, ctx: NativeContext, *, after_user_id: int, limit: int) -> dict:
    """Resume by user ID; repeat from zero after quiescing old-key writers before retirement."""
    ids = (await db.scalars(select(User.id).where(User.id > after_user_id).order_by(User.id).limit(limit))).all()
    changed = 0
    for user_id in ids:
        user = await lock_session_user(db, user_id=user_id)
        if user is None:
            continue
        factor = await db.get(LocalAuthFactor, user_id, populate_existing=True)
        if factor is not None and factor.key_id != ctx.keys.purposes["totp"].active:
            context = [ctx.installation_id, str(user_id), factor.generation]
            seed = ctx.keys.decrypt("totp", factor.key_id, factor.encrypted_seed, context)
            factor.key_id, factor.encrypted_seed = ctx.keys.encrypt("totp", seed, context)
            changed += 1
        rows = (
            await db.scalars(
                select(LocalAuthDelivery)
                .where(LocalAuthDelivery.user_id == user_id, LocalAuthDelivery.ciphertext.is_not(None))
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).all()
        for row in rows:
            if row.installation_id != ctx.installation_id:
                from .common import invalid_proof

                raise invalid_proof()
            if row.ciphertext is not None and row.key_id != ctx.keys.purposes["delivery"].active:
                context = [ctx.installation_id, str(user_id), row.id, row.grant_id or "notice"]
                plaintext = ctx.keys.decrypt("delivery", row.key_id, row.ciphertext, context)
                row.key_id, row.ciphertext = ctx.keys.encrypt("delivery", plaintext, context)
                changed += 1
        grants = (
            await db.scalars(
                select(LocalAuthGrant)
                .where(LocalAuthGrant.user_id == user_id, *active_grants())
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).all()
        for grant in grants:
            grant_context = deepcopy(grant.context)
            if "intent_key" in grant_context and grant_context["intent_key"] != ctx.keys.purposes["action"].active:
                grant.revoked_at = utc_now()
                changed += 1
                continue
            pending = grant_context.get("pending_factor")
            if pending and pending["key_id"] != ctx.keys.purposes["totp"].active:
                aad = [ctx.installation_id, str(user_id), pending["generation"]]
                plaintext = ctx.keys.decrypt("totp", pending["key_id"], pending["ciphertext"], aad)
                pending["key_id"], pending["ciphertext"] = ctx.keys.encrypt("totp", plaintext, aad)
                changed += 1
            pending = grant_context.get("pending_password")
            if pending and pending["key_id"] != ctx.keys.purposes["delivery"].active:
                aad = [ctx.installation_id, str(user_id), grant_context["recovery_id"], "recovery-password"]
                plaintext = ctx.keys.decrypt("delivery", pending["key_id"], pending["ciphertext"], aad)
                pending["key_id"], pending["ciphertext"] = ctx.keys.encrypt("delivery", plaintext, aad)
                changed += 1
            grant.context = grant_context
        await audit_local(db, user, "local_keys_reencrypted")
        await commit_local(db, "keys_reencrypted")
    return {
        "users_processed": len(ids),
        "references_changed": changed,
        "next_after_user_id": ids[-1] if ids else after_user_id,
        "done": len(ids) < limit,
    }


async def verify_key_material(db: AsyncSession, ctx: NativeContext) -> dict[str, dict[str, int]]:
    """Exercise actual decrypt capability; a matching key ID alone proves nothing."""
    for factor in (await db.scalars(select(LocalAuthFactor))).all():
        ctx.keys.decrypt(
            "totp", factor.key_id, factor.encrypted_seed, [ctx.installation_id, str(factor.user_id), factor.generation]
        )
    for row in (await db.scalars(select(LocalAuthDelivery).where(LocalAuthDelivery.ciphertext.is_not(None)))).all():
        if row.ciphertext is not None:
            ctx.keys.decrypt(
                "delivery",
                row.key_id,
                row.ciphertext,
                [ctx.installation_id, str(row.user_id), row.id, row.grant_id or "notice"],
            )
    for grant in (await db.scalars(select(LocalAuthGrant).where(*active_grants()))).all():
        pending = grant.context.get("pending_factor")
        if pending:
            ctx.keys.decrypt(
                "totp",
                pending["key_id"],
                pending["ciphertext"],
                [ctx.installation_id, str(grant.user_id), pending["generation"]],
            )
        pending = grant.context.get("pending_password")
        if pending:
            ctx.keys.decrypt(
                "delivery",
                pending["key_id"],
                pending["ciphertext"],
                [ctx.installation_id, str(grant.user_id), grant.context["recovery_id"], "recovery-password"],
            )
    return await reference_counts(db)
