"""One-time native installation onboarding; completed accounts never enter this path again."""

from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from uuid import uuid4

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.email import normalize_email
from app.core.exceptions import ConflictError, ValidationError
from app.core.production_contract import LOCAL_INVITATION_TTL_SECONDS
from app.core.user_query_options import user_selectinload_options
from app.db.production_seed import seed_departments_in_session, seed_roles_permissions_in_session
from app.models import LocalAuthDelivery, LocalAuthFactor, LocalAuthGrant, LocalBootstrapTarget, Role, User
from app.models.user import AccessScope
from app.services._identity_authority_lock import lock_identity_transition
from app.services.identity_installation import validate_installation_binding

from .artifacts import grant_active, issue_grant, revoke_grants, secret_digest
from .bootstrap_files import BootstrapFileError, publish_handoff, remove_verified_handoff, validate_destination
from .common import (
    NativeContext,
    atomic_local_work,
    audit_local,
    commit_local,
    local_user_ready,
    require_native_identity,
)
from .recovery_approvals import load_recovery_approvers


@dataclass(frozen=True)
class BootstrapRequest:
    admin_email: str
    cro_email: str
    admin_file: str
    cro_file: str

    def entries(self) -> list[tuple[str, str, str]]:
        admin, cro = normalize_email(self.admin_email), normalize_email(self.cro_email)
        if not admin or not cro or admin == cro or self.admin_file == self.cro_file:
            raise ValidationError("Distinct normalized Admin/CRO emails and separate handoff files are required")
        try:
            for email in (admin, cro):
                TypeAdapter(EmailStr).validate_python(email)
        except ValueError:
            raise ValidationError("Valid Admin/CRO email addresses are required") from None
        return [("admin", admin, self.admin_file), ("cro", cro, self.cro_file)]


async def _guard(db: AsyncSession, ctx: NativeContext) -> None:
    require_native_identity(ctx.settings)
    load_recovery_approvers(ctx.settings.local_recovery_approvers_file)
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('riskhub.identity.administration'))"))
    binding = await validate_installation_binding(db, settings=ctx.settings)
    if binding.installation_id != ctx.installation_id:
        raise ConflictError("Bootstrap installation binding changed")


async def _targets(db: AsyncSession, ctx: NativeContext) -> list[LocalBootstrapTarget]:
    return list(
        await db.scalars(
            select(LocalBootstrapTarget)
            .where(LocalBootstrapTarget.installation_id == ctx.installation_id)
            .order_by(LocalBootstrapTarget.slot)
            .execution_options(populate_existing=True)
        )
    )


async def _lock_targets(db: AsyncSession, targets: list[LocalBootstrapTarget]) -> dict[int, User]:
    # Administration -> ordered target Users -> bootstrap -> grant/delivery.
    # These operations change only onboarding artifacts, never ownership or
    # subordinate assignments, so lifecycle ownership/org guards are unnecessary.
    target_ids = {target.user_id for target in targets}
    users = {
        user.id: user
        for user in await db.scalars(
            select(User)
            .where(User.id.in_(target_ids))
            .order_by(User.id)
            .options(*user_selectinload_options(include_permissions=True))
            .with_for_update(of=User)
            .execution_options(populate_existing=True)
        )
    }
    if users.keys() != target_ids:
        raise ConflictError("Bootstrap target is unavailable")
    for target in targets:
        await db.refresh(target, with_for_update=True)
    return users


def _pending(target: LocalBootstrapTarget, user: User) -> None:
    if target.completed_at is not None or user.local_enrollment_state != "invited" or user.hashed_password is not None:
        raise ConflictError("Bootstrap reissue is limited to never-enrolled pending accounts; use governed recovery")
    if (
        user.email != target.initial_email
        or user.external_id is not None
        or user.local_suspended
        or user.local_recovery_pending
        or user.is_active
        or user.role is None
        or user.role.name != target.slot
        or not user.role.is_active
        or user.access_scope != AccessScope.GLOBAL
    ):
        raise ConflictError("Pending bootstrap principal has changed; operator reconciliation is required")


async def _new_delivery(db: AsyncSession, ctx: NativeContext, user: User) -> LocalAuthDelivery:
    grant, credential = await issue_grant(db, ctx, user, "invite", LOCAL_INVITATION_TTL_SECONDS)
    delivery_id = uuid4().hex
    payload = {
        "version": 1,
        "kind": "bootstrap-enrollment",
        "installation_id": ctx.installation_id,
        "user_id": user.id,
        "grant_id": grant.id,
        "credential": credential,
        "expires_at": grant.expires_at.isoformat(),
    }
    key_id, ciphertext = ctx.keys.encrypt(
        "delivery", json.dumps(payload, sort_keys=True), [ctx.installation_id, str(user.id), delivery_id, grant.id]
    )
    delivery = LocalAuthDelivery(
        id=delivery_id,
        user_id=user.id,
        installation_id=ctx.installation_id,
        grant_id=grant.id,
        key_id=key_id,
        ciphertext=ciphertext,
        status="bootstrap_pending",
        expires_at=grant.expires_at,
    )
    db.add(delivery)
    await db.flush()
    return delivery


def _payload(ctx: NativeContext, delivery: LocalAuthDelivery) -> dict:
    if delivery.ciphertext is None:
        raise BootstrapFileError("Handoff envelope is unavailable; explicit pending reissue is required")
    return json.loads(
        ctx.keys.decrypt(
            "delivery",
            delivery.key_id,
            delivery.ciphertext,
            [ctx.installation_id, str(delivery.user_id), delivery.id, delivery.grant_id or "notice"],
        )
    )


async def _pending_envelope(db: AsyncSession, ctx: NativeContext, user: User, delivery: LocalAuthDelivery) -> dict:
    grant = await db.get(LocalAuthGrant, delivery.grant_id, populate_existing=True, with_for_update=True)
    if grant is None or grant.purpose != "invite" or not grant_active(grant, user, ctx.installation_id):
        raise BootstrapFileError("Grant is unavailable; explicit pending reissue is required")
    return _payload(ctx, delivery)


async def bootstrap_status(db: AsyncSession, ctx: NativeContext) -> dict:
    targets = await _targets(db, ctx)
    entries = []
    operational_admin = False
    for target in targets:
        user = await db.scalar(
            select(User)
            .where(User.id == target.user_id)
            .options(*user_selectinload_options(include_permissions=True))
            .execution_options(populate_existing=True)
        )
        delivery = await db.get(LocalAuthDelivery, target.delivery_id, populate_existing=True)
        factor = await db.get(LocalAuthFactor, target.user_id)
        handoff = delivery.status if delivery else "unavailable"
        if target.completed_at is None and user is not None and user.local_enrollment_state == "password_set":
            handoff = "enrollment_started"
        elif target.completed_at is None and delivery is not None and handoff not in {"aborted", "superseded"}:
            grant = await db.get(LocalAuthGrant, delivery.grant_id, populate_existing=True)
            if user is None or grant is None or not grant_active(grant, user, ctx.installation_id):
                handoff = "invalid-or-expired"
        if target.slot == "admin" and user is not None:
            # Completion stays historical even if the account is later demoted/suspended.
            operational_admin = bool(
                user.role
                and user.role.name == "admin"
                and user.role.is_active
                and user.access_scope == AccessScope.GLOBAL
                and local_user_ready(user)
                and (
                    ctx.settings.local_mfa_policy == "optional"
                    or factor is not None
                    and factor.confirmed_at is not None
                )
            )
        entries.append(
            {
                "slot": target.slot,
                "user_id": target.user_id,
                "delivery_id": target.delivery_id,
                "grant_id": delivery.grant_id if delivery else None,
                "path": target.handoff_path,
                "enrollment": "completed" if target.completed_at is not None else "pending",
                "handoff": handoff,
            }
        )
    pending = {target.slot for target in targets if target.completed_at is None}
    status = (
        "infrastructure-ready"
        if not targets
        else (
            "admin-enrollment-pending"
            if "admin" in pending
            else "cro-enrollment-pending"
            if "cro" in pending
            else "completed"
        )
    )
    result = {
        "status": status,
        "installation_id": ctx.installation_id,
        "operational_admin": operational_admin,
        "targets": entries,
    }
    failed = [
        entry["slot"]
        for entry in entries
        if entry["enrollment"] == "pending"
        and entry["handoff"] not in {"bootstrap_delivered", "completed", "enrollment_started"}
    ]
    if failed:
        result.update(enrollment_status=status, status="handoff-failed", failed_handoffs=failed)
    return result


async def _deliver_pending(db: AsyncSession, ctx: NativeContext) -> dict:
    failed = []
    identities = [(target.slot, target.user_id) for target in await _targets(db, ctx)]
    for slot, user_id in identities:
        try:
            async with atomic_local_work(db):
                await _guard(db, ctx)
                user = await lock_identity_transition(db, user_id=user_id)
                target = await db.get(
                    LocalBootstrapTarget, (ctx.installation_id, slot), populate_existing=True, with_for_update=True
                )
                if target is None:
                    raise ConflictError("Bootstrap target is unavailable")
                if target.completed_at is not None or user.local_enrollment_state == "password_set":
                    # Interrupted factor enrollment resumes with password login, not a new invitation.
                    await db.rollback()
                    continue
                _pending(target, user)
                delivery = await db.get(
                    LocalAuthDelivery, target.delivery_id, populate_existing=True, with_for_update=True
                )
                if delivery is None:
                    raise BootstrapFileError("Bootstrap delivery is unavailable")
                if delivery.status == "bootstrap_delivered":
                    await db.rollback()
                    continue
                publish_handoff(target.handoff_path, await _pending_envelope(db, ctx, user, delivery))
                delivery.status, delivery.sent_at, delivery.ciphertext = "bootstrap_delivered", utc_now(), None
                await audit_local(db, user, "local_bootstrap_handoff_completed", evidence={"delivery_id": delivery.id})
                await commit_local(db, "bootstrap_handoff")
        except (BootstrapFileError, OSError):
            failed.append(slot)
    result = await bootstrap_status(db, ctx)
    if failed:
        result.setdefault("enrollment_status", result["status"])
        result.update(status="handoff-failed", failed_handoffs=failed)
    return result


async def bootstrap_native(
    db: AsyncSession, ctx: NativeContext, request: BootstrapRequest, *, dry_run: bool = False
) -> dict:
    entries = request.entries()
    async with atomic_local_work(db):
        await _guard(db, ctx)
        targets = await _targets(db, ctx)
        if targets:
            if len(targets) != 2:
                raise ConflictError("Incomplete bootstrap principal record; operator reconciliation required")
            by_slot = {target.slot: target for target in targets}
            users = await _lock_targets(db, targets)
            for slot, email, path in entries:
                target = by_slot[slot]
                if target.initial_email != email or target.handoff_path != path:
                    raise ConflictError("Bootstrap identities or handoff destinations conflict with persisted state")
                if target.completed_at is None and users[target.user_id].local_enrollment_state != "password_set":
                    _pending(target, users[target.user_id])
                    if dry_run:
                        delivery = await db.get(LocalAuthDelivery, target.delivery_id)
                        if delivery is None:
                            raise BootstrapFileError("Bootstrap delivery is unavailable")
                        if delivery.status != "bootstrap_delivered":
                            validate_destination(
                                path, expected=await _pending_envelope(db, ctx, users[target.user_id], delivery)
                            )
            await db.rollback()
        else:
            if await db.scalar(select(User.id).limit(1)) is not None:
                raise ConflictError("Fresh bootstrap refuses existing unknown accounts; no email adoption or elevation")
            for _, _, path in entries:
                validate_destination(path)
            inactive_role = await db.scalar(
                select(Role.id).where(Role.name.in_(["admin", "cro"]), Role.is_active.is_(False)).limit(1)
            )
            if inactive_role is not None:
                raise ConflictError("Canonical bootstrap role is inactive")
            if dry_run:
                await db.rollback()
                return {"status": "validated-not-written", "installation_id": ctx.installation_id}
            await seed_roles_permissions_in_session(db)
            await seed_departments_in_session(db)
            for slot, email, path in entries:
                role = await db.scalar(select(Role).where(Role.name == slot, Role.is_active.is_(True)))
                if role is None:
                    raise ConflictError("Canonical bootstrap role is unavailable")
                user = User(
                    email=email,
                    name="Initial Administrator" if slot == "admin" else "Initial CRO",
                    role_id=role.id,
                    access_scope=AccessScope.GLOBAL,
                    is_active=False,
                    local_enrollment_state="invited",
                    local_suspended=False,
                    hashed_password=None,
                )
                db.add(user)
                await db.flush()
                delivery = await _new_delivery(db, ctx, user)
                db.add(
                    LocalBootstrapTarget(
                        installation_id=ctx.installation_id,
                        slot=slot,
                        user_id=user.id,
                        initial_email=email,
                        delivery_id=delivery.id,
                        handoff_path=path,
                    )
                )
                await audit_local(db, user, "local_bootstrap_principal_created", evidence={"slot": slot})
            await commit_local(db, "bootstrap_principals")
    if dry_run:
        result = await bootstrap_status(db, ctx)
        result["dry_run"] = True
        return result
    return await _deliver_pending(db, ctx)


async def abort_pending_bootstrap(db: AsyncSession, ctx: NativeContext, *, reason: str) -> dict:
    if not reason.strip() or len(reason) > 2000:
        raise ValidationError("Aborting unused bootstrap grants requires an accountable reason")
    cleanup = []
    async with atomic_local_work(db):
        await _guard(db, ctx)
        targets = await _targets(db, ctx)
        users = await _lock_targets(db, targets)
        for target in targets:
            user = users[target.user_id]
            if target.completed_at is not None or user.local_enrollment_state != "invited" or user.hashed_password:
                continue
            delivery = await db.get(LocalAuthDelivery, target.delivery_id, with_for_update=True)
            grant = await db.get(LocalAuthGrant, delivery.grant_id, with_for_update=True) if delivery else None
            if delivery is None or grant is None:
                raise ConflictError("Bootstrap delivery is unavailable")
            await revoke_grants(db, user.id, purpose="invite")
            delivery.ciphertext, delivery.status = None, "aborted"
            cleanup.append((target.slot, target.handoff_path, user.id, grant.id, grant.secret_hash))
            await audit_local(db, user, "local_bootstrap_aborted", reason=reason, evidence={"slot": target.slot})
        await commit_local(db, "bootstrap_abort")
    failed = []
    for slot, path, user_id, grant_id, digest in cleanup:

        def matches(payload: dict) -> bool:
            raw = payload.get("credential")
            return bool(
                payload.get("installation_id") == ctx.installation_id
                and payload.get("user_id") == user_id
                and payload.get("grant_id") == grant_id
                and isinstance(raw, str)
                and raw.startswith(grant_id + ".")
                and secrets.compare_digest(
                    secret_digest(raw.split(".", 1)[1], installation=ctx.installation_id, purpose="invite"), digest
                )
            )

        try:
            remove_verified_handoff(path, matches)
        except (BootstrapFileError, OSError):
            failed.append(slot)
    result = await bootstrap_status(db, ctx)
    result.update(status="aborted", cleanup_failed=failed)
    return result


async def reissue_bootstrap(db: AsyncSession, ctx: NativeContext, *, slot: str, output: str, reason: str) -> dict:
    if slot not in {"admin", "cro"} or not reason.strip() or len(reason) > 2000:
        raise ValidationError("Pending bootstrap reissue requires a slot and accountable reason")
    validate_destination(output)  # Always a new destination; never overwrite old or unrelated credentials.
    async with atomic_local_work(db):
        await _guard(db, ctx)
        targets = await _targets(db, ctx)
        users = await _lock_targets(db, targets)
        target = next((target for target in targets if target.slot == slot), None)
        if target is None:
            raise ConflictError("Bootstrap target does not exist")
        user = users[target.user_id]
        _pending(target, user)
        await revoke_grants(db, user.id, purpose="invite")
        previous = await db.get(LocalAuthDelivery, target.delivery_id, with_for_update=True)
        if previous is None:
            raise ConflictError("Bootstrap delivery is unavailable")
        previous.ciphertext, previous.status = None, "superseded"
        delivery = await _new_delivery(db, ctx, user)
        target.delivery_id, target.handoff_path = delivery.id, output
        await audit_local(db, user, "local_bootstrap_invitation_reissued", reason=reason, evidence={"slot": slot})
        await commit_local(db, "bootstrap_reissue")
    return await _deliver_pending(db, ctx)
