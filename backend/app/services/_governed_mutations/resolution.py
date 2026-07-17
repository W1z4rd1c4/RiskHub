"""Atomic resolution of ADR-016 governed mutation proposals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.audit import governed_mutation as audit_governed
from app.core.audit import process as audit_process
from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
    Role,
    RolePermission,
    User,
)
from app.schemas.process import ProcessUpdate
from app.services._ict_register_lifecycle.policy import (
    can_update_process_record,
    process_owner_eligibility_error,
)
from app.services._ict_register_lifecycle.projection import (
    load_governed_process_derived_blocks,
)
from app.services._process_owner_lock import acquire_process_owner_identity_locks
from app.services.approval_scenario_policy import can_resolve_process_approval
from app.services.outbox import OutboxService
from app.services.transaction_boundary import commit_service_boundary

from .fixed_policy import load_fixed_process_scenario_for_update, validated_fixed_process_roles
from .process_identity import (
    GovernedProcessIdentity,
    InvalidGovernedProcessIdentity,
    strict_governed_process_identity,
)

_PENDING = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)
_ENVELOPE_STALE_REASON = "Governed mutation envelope integrity check failed"


@dataclass(frozen=True, slots=True)
class _GovernedResolutionContext:
    approval: ApprovalRequest
    proposal: GovernedMutationProposal
    identity: GovernedProcessIdentity
    impact_locks: list[GovernedMutationImpactLock]
    process: Process
    requester: User | None
    resolver: User
    resolver_is_active: bool
    resolver_role_name: str | None
    proposed_owner: User | None
    proposed_department: Department | None
    envelope_stale_reason: str | None


@dataclass(frozen=True, slots=True)
class _GovernedAuditIdentity:
    proposal_id: str
    proposal_version: int


def _is_positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _governed_envelope_stale_reason(
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    identity: GovernedProcessIdentity,
    impact_locks: list[GovernedMutationImpactLock],
) -> str | None:
    """Validate the complete immutable Process-v1 envelope before application."""
    identity_is_intact = (
        approval.status == ApprovalStatus.PENDING
        and approval.id == identity.approval_request_id
        and approval.resource_type == ApprovalResourceType.PROCESS
        and approval.resource_id == identity.primary_resource_id
        and approval.resource_name == identity.primary_resource_name
        and approval.action_type == identity.action_type
        and approval.scenario_key == identity.scenario_key
        and approval.scenario_approver_roles == list(identity.approver_roles)
        and approval.requested_by_id == identity.requested_by_id
        and approval.pending_changes == identity.pending_changes
        and approval.primary_approver_id is None
        and approval.primary_approved_at is None
        and approval.requires_privileged_approval is False
        and approval.privileged_approver_id is None
        and approval.privileged_approved_at is None
    )
    if not identity_is_intact:
        return _ENVELOPE_STALE_REASON

    if len(impact_locks) != 1:
        return _ENVELOPE_STALE_REASON
    impact_lock = impact_locks[0]
    if (
        impact_lock.proposal_id != proposal.id
        or impact_lock.resource_type != "process"
        or impact_lock.resource_id != identity.primary_resource_id
        or impact_lock.base_governance_version != identity.base_governance_version
        or impact_lock.released_at is not None
        or impact_lock.release_reason is not None
    ):
        return _ENVELOPE_STALE_REASON
    return None


async def _load_governed_envelope(
    db: AsyncSession,
    approval_id: int,
) -> tuple[
    ApprovalRequest,
    GovernedMutationProposal,
    list[GovernedMutationImpactLock],
]:
    """Lock the envelope before any impacted operational/reference rows."""
    approval = (
        await db.execute(select(ApprovalRequest).where(ApprovalRequest.id == approval_id).with_for_update())
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
    if proposal is None:
        raise ValidationError("Approval is not a governed mutation proposal")
    impact_locks = list(
        (
            await db.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal.id)
                .order_by(
                    GovernedMutationImpactLock.resource_type,
                    GovernedMutationImpactLock.resource_id,
                    GovernedMutationImpactLock.id,
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    return approval, proposal, impact_locks


async def _load_governed_resolution(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
) -> _GovernedResolutionContext:
    """Lock actor/reference state before the Process row in deterministic order.

    Order: approval -> proposal -> impact locks -> owner advisory identities ->
    users -> requester/resolver/proposed-owner roles -> departments -> Process.
    Parameter rows and the scenario row are locked later, after Process, by
    derivation and policy revalidation.
    """
    approval, proposal, impact_locks = await _load_governed_envelope(db, approval_id)
    try:
        identity = strict_governed_process_identity(proposal)
    except InvalidGovernedProcessIdentity as exc:
        raise ValidationError(
            "Malformed governed Process proposal",
            code="governed_mutation_identity_invalid",
        ) from exc
    if identity is None:
        raise ValidationError(
            "Approval is not an exact governed Process proposal",
            code="governed_mutation_unsupported",
        )
    envelope_stale_reason = _governed_envelope_stale_reason(
        approval=approval,
        proposal=proposal,
        identity=identity,
        impact_locks=impact_locks,
    )
    operation = proposal.proposed_changes
    proposed_after = operation.get("after", operation) if isinstance(operation, dict) else {}
    process_id = identity.primary_resource_id
    process_snapshot = (
        await db.execute(
            select(Process.process_owner_user_id, Process.owning_department_id).where(Process.id == process_id)
        )
    ).one_or_none()
    if process_snapshot is None:
        raise NotFoundError("Impacted Process not found")

    proposed_owner_value = proposed_after.get("process_owner_user_id")
    proposed_department_value = proposed_after.get("owning_department_id")
    proposed_owner_id = proposed_owner_value if _is_positive_int(proposed_owner_value) else None
    proposed_department_id = proposed_department_value if _is_positive_int(proposed_department_value) else None
    await acquire_process_owner_identity_locks(
        db,
        user_ids=(process_snapshot.process_owner_user_id, proposed_owner_id),
    )

    primary_user_ids = sorted(
        {
            identity.requested_by_id,
            current_user.id,
            proposed_owner_id,
        }
        - {None}
    )
    manager_snapshot_rows = list(
        (
            await db.execute(
                select(User.id, User.manager_id)
                .where(User.id.in_(primary_user_ids))
                .order_by(User.id)
            )
        ).all()
    )
    manager_snapshot = {row.id: row.manager_id for row in manager_snapshot_rows}
    user_ids = sorted(
        set(primary_user_ids)
        | {manager_id for manager_id in manager_snapshot.values() if manager_id is not None}
    )
    locked_user_rows = list(
        (
            await db.execute(
                select(
                    User.id,
                    User.is_active,
                    User.role_id,
                    User.manager_id,
                )
                .where(User.id.in_(user_ids))
                .order_by(User.id)
                .with_for_update()
            )
        ).all()
    )
    locked_user_state = {row.id: row for row in locked_user_rows}
    if any(
        user_id not in locked_user_state
        or locked_user_state[user_id].manager_id != manager_snapshot.get(user_id)
        for user_id in primary_user_ids
    ):
        raise ConflictError(
            "Approval actor scope changed concurrently; retry",
            code="approval_actor_scope_changed",
        )
    resolver_state = locked_user_state.get(current_user.id)
    if resolver_state is None:
        raise AuthorizationError("Resolver identity no longer exists")
    reference_role_ids = sorted(
        {
            locked_user_state[user_id].role_id
            for user_id in user_ids
            if user_id in locked_user_state
            and locked_user_state[user_id].role_id is not None
        }
    )
    locked_roles = list(
        (
            await db.execute(
                select(Role)
                .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
                .where(Role.id.in_(reference_role_ids))
                .order_by(Role.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    roles_by_id = {role.id: role for role in locked_roles}

    reference_users = list(
        (
            await db.execute(
                select(User)
                .options(
                    selectinload(User.department),
                )
                .where(User.id.in_(user_ids))
                .order_by(User.id)
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    users_by_id = {user.id: user for user in reference_users}
    for user in reference_users:
        set_committed_value(user, "role", roles_by_id.get(user.role_id))
        if user.id in primary_user_ids:
            set_committed_value(user, "manager", users_by_id.get(user.manager_id))
    resolver = users_by_id.get(current_user.id)
    if resolver is None:
        raise AuthorizationError("Resolver identity no longer exists")
    resolver_role = roles_by_id.get(resolver.role_id)

    department_ids = sorted(
        {
            process_snapshot.owning_department_id,
            proposed_department_id,
        }
        - {None}
    )
    locked_departments = list(
        (
            await db.execute(
                select(Department)
                .where(Department.id.in_(department_ids))
                .order_by(Department.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    departments_by_id = {department.id: department for department in locked_departments}

    process = (
        await db.execute(
            select(Process)
            .options(
                selectinload(Process.process_owner)
                .selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission),
                selectinload(Process.process_owner).selectinload(User.department),
                selectinload(Process.owning_department),
            )
            .where(Process.id == process_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if process is None:
        raise NotFoundError("Impacted Process not found")
    if process.process_owner_user_id != process_snapshot.process_owner_user_id:
        raise ConflictError(
            "Process ownership changed concurrently; retry",
            code="process_concurrent_mutation",
        )

    return _GovernedResolutionContext(
        approval=approval,
        proposal=proposal,
        identity=identity,
        impact_locks=impact_locks,
        process=process,
        requester=users_by_id.get(identity.requested_by_id),
        resolver=resolver,
        resolver_is_active=bool(resolver_state.is_active),
        resolver_role_name=(resolver_role.name if resolver_role is not None else None),
        proposed_owner=(users_by_id.get(proposed_owner_id) if proposed_owner_id is not None else None),
        proposed_department=(
            departments_by_id.get(proposed_department_id) if proposed_department_id is not None else None
        ),
        envelope_stale_reason=envelope_stale_reason,
    )


def _assert_pending(approval: ApprovalRequest) -> None:
    if approval.status not in _PENDING:
        raise ValidationError(f"Cannot resolve request with status: {approval.status.value}")


def _assert_independent_resolver(
    *,
    identity: GovernedProcessIdentity,
    current_user: User,
    process: Process,
    resolver_is_active: bool | None = None,
    resolver_role_name: str | None = None,
) -> None:
    snapshot_roles = list(identity.approver_roles)
    if (
        not snapshot_roles
        or not can_resolve_process_approval(
            current_user,
            process,
            requester_id=identity.requested_by_id,
            configured_roles=snapshot_roles,
            user_is_active=resolver_is_active,
            role_name=resolver_role_name,
        )
    ):
        raise AuthorizationError("Only an independent snapshotted Risk Manager or CRO may resolve this request")


def _assert_envelope_expiry_resolver(
    *,
    current_user: User,
    process: Process,
    resolver_is_active: bool,
    resolver_role_name: str | None,
    identity: GovernedProcessIdentity,
) -> None:
    """Authorize fail-closed expiry without trusting a corrupt envelope snapshot."""
    if not can_resolve_process_approval(
        current_user,
        process,
        requester_id=identity.requested_by_id,
        configured_roles=identity.approver_roles,
        user_is_active=resolver_is_active,
        role_name=resolver_role_name,
    ):
        raise AuthorizationError("Only an active Risk Manager or CRO may expire a corrupt governed mutation")


async def _live_scenario_stale_reason(
    db: AsyncSession,
    *,
    identity: GovernedProcessIdentity,
    current_user: User,
    resolver_role_name: str | None = None,
) -> str | None:
    scenario = await load_fixed_process_scenario_for_update(db)
    if not scenario.requires_approval:
        return "Protected Process approval scenario was disabled after submission"
    live_roles = validated_fixed_process_roles(scenario)
    snapshot_roles = list(identity.approver_roles)
    if live_roles != snapshot_roles:
        return "Protected Process approver roles changed after submission"
    role_name = (
        resolver_role_name
        if resolver_role_name is not None
        else getattr(getattr(current_user, "role", None), "name", None)
    )
    if role_name not in live_roles:
        return "Resolver is no longer eligible under the live scenario"
    return None


def _release_locks(impact_locks: list[GovernedMutationImpactLock], *, reason: str) -> None:
    released_at = utc_now()
    for impact_lock in impact_locks:
        if impact_lock.released_at is None:
            impact_lock.released_at = released_at
            impact_lock.release_reason = reason


async def _enqueue_terminal(db: AsyncSession, approval: ApprovalRequest) -> None:
    await OutboxService.enqueue(
        db,
        event_type="approval.request_resolved",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=(
            f"approval.request_resolved:{approval.id}:{approval.status.value.lower()}"
        ),
        payload={
            "approval_id": approval.id,
            "approved": approval.status == ApprovalStatus.APPROVED,
        },
    )


async def _expire(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    impact_locks: list[GovernedMutationImpactLock],
    process: Process,
    current_user: User,
    reason: str,
) -> None:
    approval.status = ApprovalStatus.EXPIRED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()
    approval.resolution_notes = reason
    _release_locks(impact_locks, reason="expired")
    audit_identity = _GovernedAuditIdentity(
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )
    await audit_governed.proposal_expired(
        db,
        actor=current_user,
        approval=approval,
        proposal=audit_identity,
        department_id=process.owning_department_id,
        changes={"status": {"old": "pending", "new": "expired"}},
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_expired",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_expired:{approval.id}",
        payload={"approval_id": approval.id},
    )
    await commit_service_boundary(db, boundary="governed_mutation.process_expire")


async def approve_governed_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    context = await _load_governed_resolution(
        db,
        approval_id=approval_id,
        current_user=current_user,
    )
    approval = context.approval
    proposal = context.proposal
    impact_locks = context.impact_locks
    process = context.process
    current_user = context.resolver
    _assert_pending(approval)
    stale_reason = context.envelope_stale_reason
    if stale_reason is not None:
        _assert_envelope_expiry_resolver(
            current_user=current_user,
            process=process,
            resolver_is_active=context.resolver_is_active,
            resolver_role_name=context.resolver_role_name,
            identity=context.identity,
        )
        await _expire(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=impact_locks,
            process=process,
            current_user=current_user,
            reason=stale_reason,
        )
        return await _reload(db, approval.id)
    _assert_independent_resolver(
        identity=context.identity,
        current_user=current_user,
        process=process,
        resolver_is_active=context.resolver_is_active,
        resolver_role_name=context.resolver_role_name,
    )

    typed_updates: dict[str, Any] = {}
    approved_before: dict[str, Any] = {}
    proposed_after: dict[str, Any] = {}
    if stale_reason is None:
        normalized_operation = proposal.proposed_changes
        proposed_after = normalized_operation["after"]
        approved_before = normalized_operation["before"]
        typed_updates = ProcessUpdate.model_validate(proposed_after).model_dump(exclude_unset=True)
        typed_updates.pop("request_reason", None)

    requester = context.requester
    if stale_reason is None and (
        requester is None or not requester.is_active or not can_update_process_record(requester, process)
    ):
        stale_reason = "Requester is no longer eligible to edit the impacted Process"
    elif stale_reason is None and process.governance_version != int(proposal.base_versions["process"]):
        stale_reason = "Process governance version changed after submission"
    elif stale_reason is None and any(
        jsonable_encoder(getattr(process, field, object())) != value for field, value in approved_before.items()
    ):
        stale_reason = "Process business state changed after submission"

    if stale_reason is None and "process_owner_user_id" in proposed_after:
        owner = context.proposed_owner
        if owner is None:
            stale_reason = "Proposed Process owner is no longer eligible"
        elif process_owner_eligibility_error(owner) is not None:
            stale_reason = "Proposed Process owner is no longer eligible"
    if stale_reason is None and "owning_department_id" in proposed_after:
        department = context.proposed_department
        if department is None or not department.is_active:
            stale_reason = "Proposed owning department is no longer active"

    if stale_reason is None:
        current_block, proposed_block = await load_governed_process_derived_blocks(
            db,
            process,
            updates=typed_updates,
        )
        if current_block.cif != "yes" and proposed_block.cif != "yes":
            stale_reason = "Process edit is no longer protected by the current policy"
        elif proposal.derived_impact_snapshot != {
            "before": {
                "cif": current_block.cif,
                "criticality_class": current_block.criticality_class,
            },
            "after": {
                "cif": proposed_block.cif,
                "criticality_class": proposed_block.criticality_class,
            },
        }:
            stale_reason = "Derived Process impact changed after submission"

    if stale_reason is None:
        stale_reason = await _live_scenario_stale_reason(
            db,
            identity=context.identity,
            current_user=current_user,
            resolver_role_name=context.resolver_role_name,
        )

    if stale_reason is not None:
        await _expire(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=impact_locks,
            process=process,
            current_user=current_user,
            reason=stale_reason,
        )
        return await _reload(db, approval.id)

    changes = audit_process.process_update_changes(process, typed_updates)
    for field, value in typed_updates.items():
        setattr(process, field, value)
    process.governance_version += 1
    approval.status = ApprovalStatus.APPROVED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()
    approval.resolution_notes = resolution_notes
    _release_locks(impact_locks, reason="approved")
    await audit_process.process_updated(db, actor=current_user, process=process, changes=changes)
    await audit_governed.proposal_applied(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=process.owning_department_id,
        changes=changes,
    )
    await _enqueue_terminal(db, approval)
    await commit_service_boundary(db, boundary="governed_mutation.process_apply")
    return await _reload(db, approval.id)


async def reject_governed_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    resolution_reason = resolution_notes.strip()
    if not resolution_reason:
        raise ValidationError(
            "A non-blank rejection reason is mandatory",
            code="governed_mutation_rejection_reason_required",
            status_code=422,
        )
    context = await _load_governed_resolution(
        db,
        approval_id=approval_id,
        current_user=current_user,
    )
    approval = context.approval
    proposal = context.proposal
    impact_locks = context.impact_locks
    process = context.process
    current_user = context.resolver
    _assert_pending(approval)
    stale_reason = context.envelope_stale_reason
    if stale_reason is not None:
        _assert_envelope_expiry_resolver(
            current_user=current_user,
            process=process,
            resolver_is_active=context.resolver_is_active,
            resolver_role_name=context.resolver_role_name,
            identity=context.identity,
        )
        await _expire(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=impact_locks,
            process=process,
            current_user=current_user,
            reason=stale_reason,
        )
        return await _reload(db, approval.id)
    _assert_independent_resolver(
        identity=context.identity,
        current_user=current_user,
        process=process,
        resolver_is_active=context.resolver_is_active,
        resolver_role_name=context.resolver_role_name,
    )
    stale_reason = await _live_scenario_stale_reason(
        db,
        identity=context.identity,
        current_user=current_user,
        resolver_role_name=context.resolver_role_name,
    )
    if stale_reason is not None:
        await _expire(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=impact_locks,
            process=process,
            current_user=current_user,
            reason=stale_reason,
        )
        return await _reload(db, approval.id)
    approval.status = ApprovalStatus.REJECTED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()
    approval.resolution_notes = resolution_reason
    _release_locks(impact_locks, reason="rejected")
    await audit_governed.proposal_rejected(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=process.owning_department_id,
        changes={"status": {"old": "pending", "new": "rejected"}},
    )
    await _enqueue_terminal(db, approval)
    await commit_service_boundary(db, boundary="governed_mutation.process_reject")
    return await _reload(db, approval.id)


async def cancel_governed_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
) -> ApprovalRequest:
    approval, proposal, impact_locks = await _load_governed_envelope(db, approval_id)
    _assert_pending(approval)
    try:
        identity = strict_governed_process_identity(proposal)
    except InvalidGovernedProcessIdentity as exc:
        raise ValidationError(
            "Malformed governed Process proposal",
            code="governed_mutation_identity_invalid",
        ) from exc
    if identity is None:
        raise ValidationError(
            "Approval is not an exact governed Process proposal",
            code="governed_mutation_unsupported",
        )
    process = (
        await db.execute(
            select(Process)
            .where(Process.id == identity.primary_resource_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if process is None:
        raise NotFoundError("Impacted Process not found")
    if identity.requested_by_id != current_user.id:
        raise AuthorizationError(
            "Only the requester may cancel a governed mutation request",
            code="governed_mutation_requester_cancel_required",
        )
    stale_reason = _governed_envelope_stale_reason(
        approval=approval,
        proposal=proposal,
        identity=identity,
        impact_locks=impact_locks,
    )
    if stale_reason is not None:
        await _expire(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=impact_locks,
            process=process,
            current_user=current_user,
            reason=stale_reason,
        )
        return await _reload(db, approval.id)
    approval.status = ApprovalStatus.CANCELLED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()
    _release_locks(impact_locks, reason="cancelled")
    await audit_governed.proposal_cancelled(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=process.owning_department_id,
        changes={"status": {"old": "pending", "new": "cancelled"}},
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_cancelled",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_cancelled:{approval.id}",
        payload={"approval_id": approval.id, "cancelled_by_user_id": current_user.id},
    )
    await commit_service_boundary(db, boundary="governed_mutation.process_cancel")
    return await _reload(db, approval.id)


async def _reload(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    return (
        await db.execute(
            select(ApprovalRequest)
            .options(
                selectinload(ApprovalRequest.requested_by),
                selectinload(ApprovalRequest.resolved_by),
                selectinload(ApprovalRequest.governed_mutation_proposal).selectinload(
                    GovernedMutationProposal.requested_by
                ),
            )
            .where(ApprovalRequest.id == approval_id)
        )
    ).scalar_one()


async def is_governed_approval(db: AsyncSession, approval_id: int) -> bool:
    return await governed_proposal_dispatch_kind(db, approval_id) == "fixed_process"


async def governed_proposal_dispatch_kind(
    db: AsyncSession,
    approval_id: int,
) -> str:
    proposal_identity = (
        await db.execute(
            select(
                GovernedMutationProposal.mutation_kind,
                GovernedMutationProposal.primary_resource_type,
            )
            .where(GovernedMutationProposal.approval_request_id == approval_id)
            .limit(1)
        )
    ).one_or_none()
    if proposal_identity is None:
        return "legacy"
    if (
        proposal_identity.mutation_kind == "process.edit"
        and proposal_identity.primary_resource_type == "process"
    ):
        return "fixed_process"
    return "unsupported"
