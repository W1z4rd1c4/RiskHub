"""Atomic resolution of ADR-016 governed mutation proposals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.audit import process as audit_process
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Asset,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.approval_scenario import ApprovalScenario
from app.schemas.process import ProcessUpdate
from app.services._ict_register_lifecycle.policy import (
    can_update_process_record,
    process_owner_eligibility_error,
)
from app.services._ict_register_lifecycle.projection import (
    load_governed_process_derived_blocks,
)
from app.services._ict_register_reference.parameters import IctWorkbookParameterSet
from app.services._process_owner_lock import acquire_process_owner_identity_locks
from app.services.approval_scenario_policy import can_resolve_process_approval
from app.services.transaction_boundary import commit_service_boundary

from .fixed_asset_policy import ASSET_SCENARIO_KEY, validated_fixed_asset_roles
from .fixed_policy import SCENARIO_KEY, validated_fixed_process_roles
from .fixed_vendor_policy import VENDOR_SCENARIO_KEY, validated_fixed_vendor_roles
from .process_identity import (
    GovernedProcessIdentity,
    InvalidGovernedProcessIdentity,
    strict_governed_process_identity,
)
from .resolution_lock_plan import lock_governed_process_resolution_suffix
from .terminal_transitions import finalize_governed_terminal_transition

_PENDING = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)
_ENVELOPE_STALE_REASON = "Governed mutation envelope integrity check failed"


@dataclass(frozen=True, slots=True)
class _GovernedResolutionContext:
    approval: ApprovalRequest
    proposal: GovernedMutationProposal
    identity: GovernedProcessIdentity
    impact_locks: list[GovernedMutationImpactLock]
    process: Process
    assets: dict[int, Asset]
    vendors: dict[int, Vendor]
    requester: User | None
    resolver: User
    resolver_is_active: bool
    resolver_role_name: str | None
    proposed_owner: User | None
    proposed_department: Department | None
    parameters: IctWorkbookParameterSet
    scenario: ApprovalScenario
    scenarios: dict[str, ApprovalScenario]
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

    expected_locks = {
        (
            item.get("resource_type"),
            item.get("resource_id"),
            item.get("base_governance_version"),
        )
        for item in proposal.impacted_resources_snapshot
        if isinstance(item, dict)
    }
    actual_locks = {(lock.resource_type, lock.resource_id, lock.base_governance_version) for lock in impact_locks}
    if actual_locks != expected_locks:
        return _ENVELOPE_STALE_REASON
    if any(
        impact_lock.proposal_id != proposal.id
        or impact_lock.released_at is not None
        or impact_lock.release_reason is not None
        for impact_lock in impact_locks
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
            await db.execute(select(User.id, User.manager_id).where(User.id.in_(primary_user_ids)).order_by(User.id))
        ).all()
    )
    manager_snapshot = {row.id: row.manager_id for row in manager_snapshot_rows}
    user_ids = sorted(
        set(primary_user_ids) | {manager_id for manager_id in manager_snapshot.values() if manager_id is not None}
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
        user_id not in locked_user_state or locked_user_state[user_id].manager_id != manager_snapshot.get(user_id)
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
            if user_id in locked_user_state and locked_user_state[user_id].role_id is not None
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
    asset_ids = sorted(
        {item["resource_id"] for item in proposal.impacted_resources_snapshot if item.get("resource_type") == "asset"}
    )
    vendor_ids = sorted(
        {item["resource_id"] for item in proposal.impacted_resources_snapshot if item.get("resource_type") == "vendor"}
    )
    locked_suffix = await lock_governed_process_resolution_suffix(
        db,
        process_ids=(process_id,),
        asset_ids=asset_ids,
        vendor_ids=vendor_ids,
        additional_department_ids=department_ids,
        process_options=(
            selectinload(Process.process_owner)
            .selectinload(User.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission),
            selectinload(Process.process_owner).selectinload(User.department),
            selectinload(Process.owning_department),
        ),
        scenario_keys=identity.triggered_scenarios,
    )
    departments_by_id = locked_suffix.departments
    process = locked_suffix.processes.get(process_id)
    if process is None:
        raise NotFoundError("Impacted Process not found")
    if process.process_owner_user_id != process_snapshot.process_owner_user_id:
        raise ConflictError(
            "Process ownership changed concurrently; retry",
            code="process_concurrent_mutation",
        )
    assets = list(locked_suffix.assets.values())

    return _GovernedResolutionContext(
        approval=approval,
        proposal=proposal,
        identity=identity,
        impact_locks=impact_locks,
        process=process,
        assets={asset.id: asset for asset in assets},
        vendors=locked_suffix.vendors,
        requester=users_by_id.get(identity.requested_by_id),
        resolver=resolver,
        resolver_is_active=bool(resolver_state.is_active),
        resolver_role_name=(resolver_role.name if resolver_role is not None else None),
        proposed_owner=(users_by_id.get(proposed_owner_id) if proposed_owner_id is not None else None),
        proposed_department=(
            departments_by_id.get(proposed_department_id) if proposed_department_id is not None else None
        ),
        parameters=locked_suffix.parameters,
        scenario=locked_suffix.scenario,
        scenarios=locked_suffix.scenarios,
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
    if not snapshot_roles or not can_resolve_process_approval(
        current_user,
        process,
        requester_id=identity.requested_by_id,
        configured_roles=snapshot_roles,
        user_is_active=resolver_is_active,
        role_name=resolver_role_name,
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
    *,
    scenarios: dict[str, ApprovalScenario],
    identity: GovernedProcessIdentity,
    current_user: User,
    resolver_role_name: str | None = None,
) -> str | None:
    live_role_lists: list[list[str]] = []
    for scenario_key, policy_snapshot in zip(
        identity.triggered_scenarios,
        identity.triggered_policy_snapshots,
        strict=True,
    ):
        scenario = scenarios.get(scenario_key)
        if scenario is None or not scenario.requires_approval:
            return "A triggering governed mutation scenario was disabled after submission"
        if scenario_key == SCENARIO_KEY:
            live_roles = validated_fixed_process_roles(scenario)
        elif scenario_key == ASSET_SCENARIO_KEY:
            live_roles = validated_fixed_asset_roles(scenario)
        else:
            live_roles = validated_fixed_vendor_roles(scenario)
        if live_roles != policy_snapshot["configured_roles"]:
            return "Governed mutation approver roles changed after submission"
        live_role_lists.append(live_roles)
    live_roles = [role for role in live_role_lists[0] if all(role in roles for roles in live_role_lists[1:])]
    if live_roles != list(identity.approver_roles):
        return "Governed mutation effective approver roles changed after submission"
    role_name = (
        resolver_role_name
        if resolver_role_name is not None
        else getattr(getattr(current_user, "role", None), "name", None)
    )
    if role_name not in live_roles:
        return "Resolver is no longer eligible under the live scenario"
    return None


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
    audit_identity = _GovernedAuditIdentity(
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )
    await finalize_governed_terminal_transition(
        db,
        actor=current_user,
        approval=approval,
        proposal=audit_identity,
        impact_locks=impact_locks,
        department_id=process.owning_department_id,
        status=ApprovalStatus.EXPIRED,
        resolution_notes=reason,
        audit_previous_status=ApprovalStatus.PENDING,
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
        context.assets.get(item["resource_id"]) is None
        or context.assets[item["resource_id"]].governance_version != item["base_governance_version"]
        for item in proposal.impacted_resources_snapshot
        if item.get("resource_type") == "asset"
    ):
        stale_reason = "Downstream Asset governance version changed after submission"
    elif stale_reason is None and any(
        context.vendors.get(item["resource_id"]) is None
        or context.vendors[item["resource_id"]].governance_version != item["base_governance_version"]
        for item in proposal.impacted_resources_snapshot
        if item.get("resource_type") == "vendor"
    ):
        stale_reason = "Downstream Vendor governance version changed after submission"
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
            parameters=context.parameters,
        )
        if (
            SCENARIO_KEY in context.identity.triggered_scenarios
            and current_block.cif != "yes"
            and proposed_block.cif != "yes"
        ):
            stale_reason = "Process edit is no longer protected by the current policy"
        process_impact = {
            "before": {
                "cif": current_block.cif,
                "criticality_class": current_block.criticality_class,
            },
            "after": {
                "cif": proposed_block.cif,
                "criticality_class": proposed_block.criticality_class,
            },
        }
        if context.assets:
            from .asset_mutations import process_point_asset_impacts

            _, asset_rows = await process_point_asset_impacts(
                db,
                process=process,
                updates=typed_updates,
                assets=list(context.assets.values()),
                parameters=context.parameters,
            )
            expected_impact: dict[str, Any] = {
                "processes": [{"resource_id": process.id, **process_impact}],
                "assets": asset_rows,
            }
            if ASSET_SCENARIO_KEY in context.identity.triggered_scenarios and not any(
                block["cif"] == "yes" or block["resulting_criticality"] == "critical"
                for row in asset_rows
                for block in (row["before"], row["after"])
            ):
                stale_reason = "Downstream Assets are no longer protected by the current policy"
        else:
            expected_impact = process_impact
        if context.vendors:
            from .vendor_impact import process_point_vendor_impacts, vendor_impact_is_protected

            _, vendor_rows = await process_point_vendor_impacts(
                db,
                process=process,
                updates=typed_updates,
                vendors=list(context.vendors.values()),
                parameters=context.parameters,
            )
            if "processes" not in expected_impact:
                expected_impact = {
                    "processes": [{"resource_id": process.id, **process_impact}],
                }
            expected_impact["vendors"] = vendor_rows
            if VENDOR_SCENARIO_KEY in context.identity.triggered_scenarios and not any(
                vendor_impact_is_protected(block)
                for row in vendor_rows
                for block in (row["before"], row["after"])
            ):
                stale_reason = "Downstream Vendors are no longer protected by the current policy"
        if proposal.derived_impact_snapshot != expected_impact:
            stale_reason = "Derived Process impact changed after submission"

    if stale_reason is None:
        stale_reason = await _live_scenario_stale_reason(
            scenarios=context.scenarios,
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
    for asset in context.assets.values():
        asset.governance_version += 1
    for vendor in context.vendors.values():
        vendor.governance_version += 1
    await audit_process.process_updated(db, actor=current_user, process=process, changes=changes)
    await finalize_governed_terminal_transition(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        impact_locks=impact_locks,
        department_id=process.owning_department_id,
        status=ApprovalStatus.APPROVED,
        resolution_notes=resolution_notes,
        applied_changes=changes,
    )
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
        scenarios=context.scenarios,
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
    await finalize_governed_terminal_transition(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        impact_locks=impact_locks,
        department_id=process.owning_department_id,
        status=ApprovalStatus.REJECTED,
        resolution_notes=resolution_reason,
    )
    await commit_service_boundary(db, boundary="governed_mutation.process_reject")
    return await _reload(db, approval.id)


async def cancel_governed_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
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
    if context.identity.requested_by_id != current_user.id:
        raise AuthorizationError(
            "Only the requester may cancel a governed mutation request",
            code="governed_mutation_requester_cancel_required",
        )
    stale_reason = context.envelope_stale_reason
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
    await finalize_governed_terminal_transition(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        impact_locks=impact_locks,
        department_id=process.owning_department_id,
        status=ApprovalStatus.CANCELLED,
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
    return (await governed_proposal_dispatch_kind(db, approval_id)).startswith("fixed_")


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
    if proposal_identity.mutation_kind == "process.edit" and proposal_identity.primary_resource_type == "process":
        return "fixed_process"
    from .process_mutations import is_extended_process_kind

    if proposal_identity.primary_resource_type == "process" and is_extended_process_kind(
        proposal_identity.mutation_kind
    ):
        return "fixed_process_extended"
    from .asset_mutations import is_asset_governed_kind

    if proposal_identity.primary_resource_type == "asset" and (
        is_asset_governed_kind(proposal_identity.mutation_kind)
        or (
            isinstance(proposal_identity.mutation_kind, str)
            and proposal_identity.mutation_kind.startswith(("asset.", "composite.process_asset."))
        )
    ):
        # Route malformed/unknown Asset-family kinds through the bounded Asset
        # resolver so they expire and release locks instead of becoming a 400.
        return "fixed_asset"
    from .vendor_identity import is_vendor_governed_kind

    if (
        proposal_identity.primary_resource_type == "vendor"
        and is_vendor_governed_kind(proposal_identity.mutation_kind)
    ):
        return "fixed_vendor"
    return "unsupported"
