"""Atomic resolution for governed Threat Steward reassignments."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.audit import threat as audit_threat
from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.permissions import can_manage_users
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    Permission,
    Role,
    RolePermission,
    Threat,
    User,
)
from app.services._ict_register_lifecycle.threat_policy import (
    assert_active_ciso_steward,
    assert_threat_update_allowed,
)
from app.services._ict_register_reference.parameters import (
    load_ict_workbook_parameter_set_for_update,
)
from app.services._threat_stewardship_lock import (
    acquire_threat_steward_identity_locks,
)
from app.services.transaction_boundary import commit_service_boundary

from .fixed_accountability_policy import (
    is_fixed_accountability_resolution_authority,
    is_live_eligible_accountability_resolver,
    load_fixed_accountability_scenario_for_update,
    validated_fixed_accountability_roles,
)
from .terminal_transitions import finalize_governed_terminal_transition
from .threat_identity import valid_threat_governed_envelope


async def _load_envelope(
    db: AsyncSession,
    approval_id: int,
) -> tuple[
    ApprovalRequest,
    GovernedMutationProposal,
    list[GovernedMutationImpactLock],
]:
    approval = (
        await db.execute(
            select(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if approval is None:
        raise NotFoundError("Approval request not found")
    proposal = (
        await db.execute(
            select(GovernedMutationProposal)
            .where(GovernedMutationProposal.approval_request_id == approval.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if proposal is None or proposal.primary_resource_type != "threat":
        raise ValidationError("Approval is not a governed Threat mutation")
    locks = list(
        (
            await db.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal.id)
                .order_by(
                    GovernedMutationImpactLock.resource_type,
                    GovernedMutationImpactLock.resource_id,
                )
                .with_for_update()
            )
        ).scalars()
    )
    return approval, proposal, locks


async def _reload(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    return (
        await db.execute(
            select(ApprovalRequest)
            .options(
                selectinload(ApprovalRequest.requested_by),
                selectinload(ApprovalRequest.resolved_by),
                selectinload(ApprovalRequest.governed_mutation_proposal),
            )
            .where(ApprovalRequest.id == approval_id)
        )
    ).scalar_one()


async def _lock_resolution_actors(
    db: AsyncSession,
    *,
    requester_id: int,
    resolver_id: int,
) -> dict[int, User]:
    actor_ids = sorted({requester_id, resolver_id})
    actor_states = list(
        (
            await db.execute(
                select(User)
                .where(User.id.in_(actor_ids))
                .order_by(User.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    role_ids = sorted(
        {
            actor.role_id
            for actor in actor_states
            if actor.role_id is not None
        }
    )
    roles = list(
        (
            await db.execute(
                select(Role)
                .where(Role.id.in_(role_ids))
                .order_by(Role.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    role_permissions = list(
        (
            await db.execute(
                select(RolePermission)
                .where(RolePermission.role_id.in_(role_ids))
                .order_by(
                    RolePermission.role_id,
                    RolePermission.permission_id,
                    RolePermission.id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    permission_ids = sorted(
        {role_permission.permission_id for role_permission in role_permissions}
    )
    permissions = list(
        (
            await db.execute(
                select(Permission)
                .where(Permission.id.in_(permission_ids))
                .order_by(Permission.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    permissions_by_id = {
        permission.id: permission
        for permission in permissions
    }
    role_permissions_by_role: dict[int, list[RolePermission]] = {
        role_id: []
        for role_id in role_ids
    }
    for role_permission in role_permissions:
        set_committed_value(
            role_permission,
            "permission",
            permissions_by_id.get(role_permission.permission_id),
        )
        role_permissions_by_role.setdefault(
            role_permission.role_id,
            [],
        ).append(role_permission)
    roles_by_id = {role.id: role for role in roles}
    for role in roles:
        set_committed_value(
            role,
            "permissions",
            role_permissions_by_role.get(role.id, []),
        )
    actors = list(
        (
            await db.execute(
                select(User)
                .options(selectinload(User.department))
                .where(User.id.in_(actor_ids))
                .order_by(User.id)
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    actors_by_id = {actor.id: actor for actor in actors}
    for actor in actors:
        set_committed_value(actor, "role", roles_by_id.get(actor.role_id))
    return actors_by_id


async def _live_policy(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    current_user: User,
    envelope_valid: bool,
    locks: list[GovernedMutationImpactLock],
) -> tuple[User, User, Threat | None, User | None, str | None]:
    actors = await _lock_resolution_actors(
        db,
        requester_id=proposal.requested_by_id,
        resolver_id=current_user.id,
    )
    resolver = actors.get(current_user.id)
    requester = actors.get(proposal.requested_by_id)
    if resolver is None or requester is None:
        raise AuthorizationError("Governed Threat actor is unavailable")
    raw_before = proposal.proposed_changes.get("before")
    raw_after = proposal.proposed_changes.get("after")
    current_id = (
        raw_before.get("threat_steward_user_id")
        if isinstance(raw_before, dict)
        else None
    )
    proposed_id = (
        raw_after.get("threat_steward_user_id")
        if isinstance(raw_after, dict)
        else None
    )
    threat = (
        await db.execute(
            select(Threat)
            .options(
                selectinload(Threat.threat_steward)
                .selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission),
                selectinload(Threat.threat_steward).selectinload(User.department),
            )
            .where(Threat.id == proposal.primary_resource_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    await acquire_threat_steward_identity_locks(
        db,
        user_ids=(current_id, proposed_id),
    )
    proposed_steward = None
    if type(proposed_id) is int:
        try:
            proposed_steward = await assert_active_ciso_steward(
                db,
                user_id=proposed_id,
                acquire_identity_lock=False,
            )
        except ValidationError:
            proposed_steward = None
    await load_ict_workbook_parameter_set_for_update(db)
    scenario = await load_fixed_accountability_scenario_for_update(db)
    roles = validated_fixed_accountability_roles(scenario)
    snapshot_roles = proposal.scenario_snapshot.get("approver_roles")
    role_name = getattr(getattr(resolver, "role", None), "name", None)
    snapshot_authorized = bool(
        is_fixed_accountability_resolution_authority(resolver, proposal)
        and isinstance(snapshot_roles, list)
        and role_name in snapshot_roles
        and proposal.approval_request.scenario_approver_roles == snapshot_roles
    )
    if not snapshot_authorized:
        raise AuthorizationError(
            "Only an independent active snapshotted Risk Manager or CRO may "
            "resolve this Threat request"
        )
    if (
        not scenario.requires_approval
        or proposal.scenario_snapshot.get("approver_roles") != roles
        or proposal.approval_request.scenario_approver_roles != roles
    ):
        return (
            resolver,
            requester,
            None,
            None,
            "Threat accountability policy changed after submission",
        )
    if not is_live_eligible_accountability_resolver(
        resolver,
        proposal,
        scenario,
    ):
        raise AuthorizationError(
            "Only an independent active Risk Manager or CRO may resolve this Threat request"
        )
    if not envelope_valid:
        return (
            resolver,
            requester,
            None,
            None,
            "Governed Threat approval envelope is malformed",
        )
    orphan_locks = [
        lock for lock in locks if lock.resource_type == "orphaned_item"
    ]
    try:
        if not requester.is_active:
            raise AuthorizationError(
                "Requester is no longer active"
            )
        if threat is not None:
            if orphan_locks:
                if not can_manage_users(requester):
                    raise AuthorizationError(
                        "Requester cannot operate orphan reassignment"
                    )
            else:
                await assert_threat_update_allowed(
                    db,
                    threat_id=threat.id,
                    current_user=requester,
                    for_update=False,
                )
    except (AuthorizationError, ValidationError):
        return (
            resolver,
            requester,
            threat,
            proposed_steward,
            "Threat requester authority changed after submission",
        )
    threat_locks = [lock for lock in locks if lock.resource_type == "threat"]
    lock = threat_locks[0] if len(threat_locks) == 1 else None
    stale = bool(
        threat is None
        or proposed_steward is None
        or lock is None
        or lock.resource_type != "threat"
        or lock.resource_id != proposal.primary_resource_id
        or lock.base_governance_version != threat.governance_version
        or proposal.base_versions != {"threat": threat.governance_version}
        or threat.threat_steward_user_id != current_id
        or proposal.before_snapshot
        != {
            "threat_steward": (
                threat.threat_steward.name
                if threat is not None and threat.threat_steward is not None
                else "Unknown user"
            )
        }
        or proposal.after_snapshot
        != {"threat_steward": proposed_steward.name}
    )
    return (
        resolver,
        requester,
        threat,
        proposed_steward,
        "Threat Steward reassignment became stale" if stale else None,
    )


async def _expire(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    locks: list[GovernedMutationImpactLock],
    actor: User,
    reason: str,
) -> ApprovalRequest:
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=actor,
        department_id=actor.department_id,
        status=ApprovalStatus.EXPIRED,
        resolution_notes=reason,
    )
    await commit_service_boundary(
        db,
        boundary="governed_mutation.threat.expire",
    )
    return await _reload(db, approval.id)


async def approve_threat_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    approval, proposal, locks = await _load_envelope(db, approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(
            f"Cannot approve request with status: {approval.status.value}"
        )
    resolver, _requester, threat, proposed_steward, stale_reason = (
        await _live_policy(
            db,
            proposal=proposal,
            current_user=current_user,
            envelope_valid=valid_threat_governed_envelope(proposal, locks),
            locks=locks,
        )
    )
    if stale_reason:
        return await _expire(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=stale_reason,
        )
    assert threat is not None and proposed_steward is not None
    orphan_locks = [
        lock for lock in locks if lock.resource_type == "orphaned_item"
    ]
    governed_orphan: OrphanedItem | None = None
    if orphan_locks:
        orphan_lock = orphan_locks[0] if len(orphan_locks) == 1 else None
        governed_orphan = (
            await db.execute(
                select(OrphanedItem)
                .where(
                    OrphanedItem.id
                    == (orphan_lock.resource_id if orphan_lock else -1)
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        raw_before = proposal.proposed_changes.get("before")
        if (
            orphan_lock is None
            or governed_orphan is None
            or governed_orphan.item_type != "threat"
            or governed_orphan.item_id != threat.id
            or governed_orphan.status != "pending"
            or governed_orphan.responsibility_role is not None
            or governed_orphan.previous_owner_id
            != orphan_lock.base_governance_version
            or not isinstance(raw_before, dict)
            or raw_before.get("threat_steward_user_id")
            != orphan_lock.base_governance_version
        ):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Orphaned Threat evidence changed after submission",
            )
    else:
        raw_before = proposal.proposed_changes.get("before")
        if (
            isinstance(raw_before, dict)
            and raw_before.get("threat_steward_user_id")
            != proposed_steward.id
        ):
            governed_orphan = (
                await db.execute(
                    select(OrphanedItem)
                    .where(
                        OrphanedItem.item_type == "threat",
                        OrphanedItem.item_id == threat.id,
                        OrphanedItem.status == "pending",
                        OrphanedItem.responsibility_role.is_(None),
                        OrphanedItem.previous_owner_id
                        == raw_before.get("threat_steward_user_id"),
                    )
                    .order_by(OrphanedItem.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars().first()
    changes = audit_threat.threat_update_changes(
        threat,
        {"threat_steward_user_id": proposed_steward.id},
    )
    threat.threat_steward_user_id = proposed_steward.id
    threat.threat_steward = proposed_steward
    threat.governance_version += 1
    if governed_orphan is not None:
        governed_orphan.status = "resolved"
        governed_orphan.resolved_at = utc_now()
        governed_orphan.resolved_by_id = resolver.id
        governed_orphan.new_owner_id = proposed_steward.id
    await audit_threat.threat_updated(
        db,
        actor=resolver,
        threat=threat,
        changes=changes,
    )
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=resolver,
        department_id=resolver.department_id,
        status=ApprovalStatus.APPROVED,
        resolution_notes=resolution_notes,
        applied_changes=approval.pending_changes,
    )
    await commit_service_boundary(
        db,
        boundary="governed_mutation.threat.resolve",
    )
    return await _reload(db, approval.id)


async def reject_threat_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    if not resolution_notes.strip():
        raise ValidationError(
            "A rejection reason is mandatory",
            code="governed_mutation_rejection_reason_required",
            status_code=422,
        )
    approval, proposal, locks = await _load_envelope(db, approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(
            f"Cannot reject request with status: {approval.status.value}"
        )
    resolver, _requester, _threat, _target, stale_reason = await _live_policy(
        db,
        proposal=proposal,
        current_user=current_user,
        envelope_valid=valid_threat_governed_envelope(proposal, locks),
        locks=locks,
    )
    if stale_reason:
        return await _expire(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=stale_reason,
        )
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=resolver,
        department_id=resolver.department_id,
        status=ApprovalStatus.REJECTED,
        resolution_notes=resolution_notes,
    )
    await commit_service_boundary(
        db,
        boundary="governed_mutation.threat.reject",
    )
    return await _reload(db, approval.id)


async def cancel_threat_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
) -> ApprovalRequest:
    approval, proposal, locks = await _load_envelope(db, approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(
            f"Cannot cancel request with status: {approval.status.value}"
        )
    if proposal.requested_by_id != current_user.id:
        raise AuthorizationError(
            "Only the requester may cancel a governed Threat mutation request"
        )
    if not valid_threat_governed_envelope(proposal, locks):
        return await _expire(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=current_user,
            reason="Governed Threat approval envelope is malformed",
        )
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=current_user,
        department_id=current_user.department_id,
        status=ApprovalStatus.CANCELLED,
        resolution_notes="Cancelled by requester",
    )
    await commit_service_boundary(
        db,
        boundary="governed_mutation.threat.cancel",
    )
    return await _reload(db, approval.id)


__all__ = [
    "approve_threat_mutation",
    "cancel_threat_mutation",
    "reject_threat_mutation",
]
