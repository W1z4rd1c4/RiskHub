"""Atomic resolution for protected direct Vendor mutations (#87)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar, cast

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.audit import vendor as audit_vendor
from app.core.audit import vendor_contract as audit_vendor_contract
from app.core.audit import vendor_sub_outsourcing as audit_vendor_sub_outsourcing
from app.core.datetime_utils import utc_now
from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.permissions import can_read_vendor, has_permission
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    Permission,
    Role,
    RolePermission,
    User,
    Vendor,
    VendorContract,
    VendorSubOutsourcing,
)
from app.models.approval_scenario import ApprovalScenario
from app.schemas.vendor import VendorCreate, VendorUpdate
from app.schemas.vendor_contract import VendorContractCreate, VendorContractUpdate
from app.schemas.vendor_sub_outsourcing import (
    VendorSubOutsourcingCreate,
    VendorSubOutsourcingUpdate,
)
from app.services._ict_register_reference.parameters import (
    load_ict_workbook_parameter_set_for_update,
)
from app.services._vendor_governance.policy import (
    assert_vendor_archive_allowed,
    assert_vendor_create_allowed,
    assert_vendor_governance_update_allowed,
    assert_vendor_update_allowed,
)
from app.services._vendor_governance.sub_outsourcing_policy import (
    acquire_sub_outsourcing_chain_lock,
    assert_chain_contract,
    assert_chain_predecessor,
)
from app.services.transaction_boundary import commit_service_boundary

from .composite_policy import effective_triggered_policy_roles
from .fixed_accountability_policy import (
    validated_fixed_accountability_roles,
)
from .fixed_vendor_policy import (
    VENDOR_SCENARIO_KEY,
    is_fixed_vendor_resolution_authority,
    validated_fixed_vendor_roles,
)
from .terminal_transitions import finalize_governed_terminal_transition
from .vendor_identity import (
    VENDOR_ARCHIVE_KIND,
    VENDOR_CHILD_KINDS,
    VENDOR_CREATE_KIND,
    VENDOR_EDIT_KIND,
    VENDOR_RELATIONSHIP_KINDS,
    valid_vendor_governed_envelope,
    vendor_triggered_scenarios,
)
from .vendor_mutations import (
    _creation_impact,
    _existing_vendor_impacts,
    _safe_vendor_creation_snapshot,
    _safe_vendor_edit_snapshots,
    acquire_vendor_creation_name_lock,
)


async def _load_envelope(
    db: AsyncSession,
    approval_id: int,
) -> tuple[ApprovalRequest, GovernedMutationProposal, list[GovernedMutationImpactLock]]:
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
    if proposal is None or proposal.primary_resource_type != "vendor":
        raise ValidationError("Approval is not a governed Vendor mutation")
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


async def _live_policy(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    envelope_valid: bool,
    current_user: User,
) -> tuple[User, User, Vendor | None, str | None]:
    actor_ids = sorted(
        {
            proposal.requested_by_id,
            current_user.id,
            *_positive_ids_for_keys(
                proposal.proposed_changes,
                frozenset({"outsourcing_owner_user_id"}),
            ),
        }
    )
    actors = list(
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
    role_ids = sorted({actor.role_id for actor in actors if actor.role_id is not None})
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
    permission_ids = sorted({row.permission_id for row in role_permissions})
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
    permissions_by_id = {permission.id: permission for permission in permissions}
    role_permissions_by_role: dict[int, list[RolePermission]] = {
        role_id: [] for role_id in role_ids
    }
    for role_permission in role_permissions:
        set_committed_value(
            role_permission,
            "permission",
            permissions_by_id.get(role_permission.permission_id),
        )
        role_permissions_by_role.setdefault(role_permission.role_id, []).append(
            role_permission
        )
    roles_by_id = {role.id: role for role in roles}
    for role in roles:
        set_committed_value(
            role,
            "permissions",
            role_permissions_by_role.get(role.id, []),
        )
    actors_by_id = {actor.id: actor for actor in actors}
    for actor in actors:
        set_committed_value(actor, "role", roles_by_id.get(actor.role_id))
    resolver = actors_by_id.get(current_user.id)
    requester = actors_by_id.get(proposal.requested_by_id)
    if resolver is None or requester is None:
        raise AuthorizationError("Governed Vendor actor is unavailable")
    vendor = None
    if type(proposal.primary_resource_id) is int:
        vendor = (
            await db.execute(
                select(Vendor)
                .where(Vendor.id == proposal.primary_resource_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
    await load_ict_workbook_parameter_set_for_update(db)
    scenario_keys = (
        vendor_triggered_scenarios(proposal)
        if envelope_valid
        else (VENDOR_SCENARIO_KEY,)
    )
    scenarios = list(
        (
            await db.execute(
                select(ApprovalScenario)
                .where(ApprovalScenario.key.in_(sorted(set(scenario_keys))))
                .order_by(ApprovalScenario.key)
                .with_for_update()
            )
        ).scalars()
    )
    scenarios_by_key = {scenario.key: scenario for scenario in scenarios}
    if set(scenarios_by_key) != set(scenario_keys):
        raise ConflictError("Governed Vendor approval scenario is missing")
    live_policies: list[dict[str, object]] = []
    for scenario_key in scenario_keys:
        scenario = scenarios_by_key[scenario_key]
        if not scenario.requires_approval:
            return (
                resolver,
                requester,
                vendor,
                "A triggering governed Vendor scenario was disabled after submission",
            )
        configured_roles = (
            validated_fixed_vendor_roles(scenario)
            if scenario_key == VENDOR_SCENARIO_KEY
            else validated_fixed_accountability_roles(scenario)
        )
        live_policies.append({"configured_roles": configured_roles})
    live_roles = effective_triggered_policy_roles(live_policies)
    resolver_role = getattr(getattr(resolver, "role", None), "name", None)
    snapshot_roles = (
        proposal.scenario_snapshot.get("approver_roles")
        if isinstance(proposal.scenario_snapshot, dict)
        else None
    )
    if not (
        is_fixed_vendor_resolution_authority(resolver, proposal)
        and resolver_role in live_roles
        and isinstance(snapshot_roles, list)
        and resolver_role in snapshot_roles
        # scenario_approver_roles is nullable in the DB, but application writers
        # (vendor_mutations.py) always persist a non-null list for governed Vendor
        # submissions. A corrupt/legacy NULL row raises TypeError on this membership
        # test — identically pre- and post-typing-wave (pre-existing assumption; the
        # cast is a runtime no-op and introduced no behavior change).
        and resolver_role
        in cast("list[str]", proposal.approval_request.scenario_approver_roles)
    ):
        raise AuthorizationError(
            "Only an independent active Risk Manager or CRO may resolve this Vendor request"
        )
    if not envelope_valid:
        return resolver, requester, vendor, "Governed Vendor approval envelope is malformed"
    if proposal.mutation_kind == VENDOR_EDIT_KIND:
        raw_after = proposal.proposed_changes["after"]
        proposed_owner_id = raw_after.get("outsourcing_owner_user_id")
        if type(proposed_owner_id) is int:
            proposed_owner = actors_by_id.get(proposed_owner_id)
            if proposed_owner is None or not proposed_owner.is_active:
                return (
                    resolver,
                    requester,
                    vendor,
                    "The proposed Vendor Outsourcing Owner is no longer eligible",
                )
    policy_snapshots = proposal.scenario_snapshot.get("triggered_policies")
    if policy_snapshots is None:
        snapshot_role_lists = [proposal.scenario_snapshot["approver_roles"]]
    else:
        snapshot_role_lists = [
            policy["configured_roles"] for policy in policy_snapshots
        ]
    if [
        policy["configured_roles"] for policy in live_policies
    ] != snapshot_role_lists:
        return resolver, requester, vendor, "Governed Vendor roles changed after submission"
    if (
        proposal.scenario_snapshot["approver_roles"] != live_roles
        or proposal.approval_request.scenario_approver_roles != live_roles
    ):
        return resolver, requester, vendor, "Governed Vendor roles changed after submission"
    if not requester.is_active:
        return resolver, requester, vendor, "The governed Vendor requester is no longer authorized"
    if proposal.mutation_kind in VENDOR_CHILD_KINDS and not (
        has_permission(requester, "vendors", "read")
        and has_permission(requester, "vendor_contracts", "write")
        and vendor is not None
        and can_read_vendor(vendor, requester)
    ):
        return resolver, requester, vendor, "The governed Vendor requester is no longer authorized"
    return resolver, requester, vendor, None


def _positive_ids_for_keys(value: object, keys: frozenset[str]) -> set[int]:
    if isinstance(value, dict):
        found: set[int] = {
            item
            for key, item in value.items()
            if key in keys and type(item) is int and item > 0
        }
        for nested in value.values():
            found.update(_positive_ids_for_keys(nested, keys))
        return found
    if isinstance(value, list):
        found = set()
        for nested in value:
            found.update(_positive_ids_for_keys(nested, keys))
        return found
    return set()


async def _expire(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    locks: list[GovernedMutationImpactLock],
    actor: User,
    reason: str,
    department_id: int | None,
) -> ApprovalRequest:
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=actor,
        department_id=department_id,
        status=ApprovalStatus.EXPIRED,
        resolution_notes=reason,
    )
    await commit_service_boundary(db, boundary="governed_mutation.vendor.expire")
    return await _reload(db, approval.id)


_ChildT = TypeVar("_ChildT", VendorContract, VendorSubOutsourcing)
_CreateT = TypeVar("_CreateT", bound=BaseModel)
_UpdateT = TypeVar("_UpdateT", bound=BaseModel)


async def _emit_contract_created(
    db: AsyncSession, actor: User, contract: VendorContract
) -> None:
    await audit_vendor_contract.vendor_contract_created(
        db, actor=actor, contract=contract
    )


async def _emit_contract_updated(
    db: AsyncSession,
    actor: User,
    contract: VendorContract,
    changes: dict[str, dict[str, object]],
) -> None:
    await audit_vendor_contract.vendor_contract_updated(
        db, actor=actor, contract=contract, changes=changes
    )


async def _emit_contract_archived(
    db: AsyncSession,
    actor: User,
    contract: VendorContract,
    changes: dict[str, dict[str, object]],
) -> None:
    await audit_vendor_contract.vendor_contract_archived(
        db, actor=actor, contract=contract, changes=changes
    )


async def _emit_sub_outsourcing_created(
    db: AsyncSession, actor: User, entry: VendorSubOutsourcing
) -> None:
    await audit_vendor_sub_outsourcing.vendor_sub_outsourcing_created(
        db, actor=actor, entry=entry
    )


async def _emit_sub_outsourcing_updated(
    db: AsyncSession,
    actor: User,
    entry: VendorSubOutsourcing,
    changes: dict[str, dict[str, object]],
) -> None:
    await audit_vendor_sub_outsourcing.vendor_sub_outsourcing_updated(
        db, actor=actor, entry=entry, changes=changes
    )


async def _emit_sub_outsourcing_archived(
    db: AsyncSession,
    actor: User,
    entry: VendorSubOutsourcing,
    changes: dict[str, dict[str, object]],
) -> None:
    await audit_vendor_sub_outsourcing.vendor_sub_outsourcing_archived(
        db, actor=actor, entry=entry, changes=changes
    )


async def _assert_sub_outsourcing_create_chain(
    db: AsyncSession, vendor_id: int, values: dict[str, Any]
) -> None:
    await assert_chain_contract(
        db,
        vendor_id=vendor_id,
        contract_id=values["contract_id"],
    )
    if values.get("predecessor_id") is not None:
        await assert_chain_predecessor(
            db,
            vendor_id=vendor_id,
            contract_id=values["contract_id"],
            predecessor_id=values["predecessor_id"],
        )


async def _assert_sub_outsourcing_edit_chain(
    db: AsyncSession,
    vendor_id: int,
    entry: VendorSubOutsourcing,
    values: dict[str, Any],
) -> None:
    contract_id = values.get("contract_id", entry.contract_id)
    predecessor_id = values.get("predecessor_id", entry.predecessor_id)
    await assert_chain_contract(
        db,
        vendor_id=vendor_id,
        contract_id=contract_id,
    )
    if predecessor_id is not None:
        await assert_chain_predecessor(
            db,
            vendor_id=vendor_id,
            contract_id=contract_id,
            predecessor_id=predecessor_id,
            entry_id=entry.id,
        )


@dataclass(frozen=True)
class _LineageSpec(Generic[_ChildT, _CreateT, _UpdateT]):
    """One governed Vendor child lineage (Contract or Sub-outsourcing).

    Bundles the ORM model, payload schemas, audit emitters, and chain
    assertions so the polymorphic replay below stays type-consistent per
    lineage instead of mixing ``type[VendorContract]`` reassignments.
    """

    model: type[_ChildT]
    create_schema: type[_CreateT]
    update_schema: type[_UpdateT]
    emit_created: Callable[[AsyncSession, User, _ChildT], Awaitable[None]]
    update_changes: Callable[[_ChildT, dict[str, object]], dict[str, dict[str, object]]]
    emit_updated: Callable[
        [AsyncSession, User, _ChildT, dict[str, dict[str, object]]], Awaitable[None]
    ]
    archive_changes: Callable[[_ChildT], dict[str, dict[str, object]]]
    emit_archived: Callable[
        [AsyncSession, User, _ChildT, dict[str, dict[str, object]]], Awaitable[None]
    ]
    assert_create_chain: (
        Callable[[AsyncSession, int, dict[str, Any]], Awaitable[None]] | None
    )
    assert_edit_chain: (
        Callable[[AsyncSession, int, _ChildT, dict[str, Any]], Awaitable[None]] | None
    )


_CONTRACT_LINEAGE = _LineageSpec(
    model=VendorContract,
    create_schema=VendorContractCreate,
    update_schema=VendorContractUpdate,
    emit_created=_emit_contract_created,
    update_changes=audit_vendor_contract.vendor_contract_update_changes,
    emit_updated=_emit_contract_updated,
    archive_changes=audit_vendor_contract.vendor_contract_archive_changes,
    emit_archived=_emit_contract_archived,
    assert_create_chain=None,
    assert_edit_chain=None,
)

_SUB_OUTSOURCING_LINEAGE = _LineageSpec(
    model=VendorSubOutsourcing,
    create_schema=VendorSubOutsourcingCreate,
    update_schema=VendorSubOutsourcingUpdate,
    emit_created=_emit_sub_outsourcing_created,
    update_changes=audit_vendor_sub_outsourcing.vendor_sub_outsourcing_update_changes,
    emit_updated=_emit_sub_outsourcing_updated,
    archive_changes=audit_vendor_sub_outsourcing.vendor_sub_outsourcing_archive_changes,
    emit_archived=_emit_sub_outsourcing_archived,
    assert_create_chain=_assert_sub_outsourcing_create_chain,
    assert_edit_chain=_assert_sub_outsourcing_edit_chain,
)


async def _apply_child_mutation(
    db: AsyncSession,
    *,
    spec: _LineageSpec[_ChildT, _CreateT, _UpdateT],
    action: str,
    vendor: Vendor,
    resolver: User,
    child_id: object,
    before: object,
    after: object,
) -> str | None:
    """Replay one governed child mutation; return the stale reason, if any."""
    child = None
    if action != "create":
        child = (
            await db.execute(
                select(spec.model)
                .where(spec.model.id == child_id, spec.model.vendor_id == vendor.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
    if action == "create":
        try:
            create_payload = spec.create_schema.model_validate(after)
            values = create_payload.model_dump(exclude={"request_reason"})
        except (TypeError, ValueError):
            values = {}
        if not values or child_id is not None or before is not None:
            return "Governed Vendor child creation payload is stale"
        if spec.assert_create_chain is not None:
            await spec.assert_create_chain(db, vendor.id, values)
        child = spec.model(vendor_id=vendor.id, **values)
        db.add(child)
        await db.flush()
        await spec.emit_created(db, resolver, child)
    elif action == "edit":
        try:
            update_payload = spec.update_schema.model_validate(after)
            values = update_payload.model_dump(
                exclude_unset=True,
                exclude={"request_reason"},
            )
        except (TypeError, ValueError):
            values = {}
        if (
            child is None
            or child.is_archived
            or not values
            or not isinstance(before, dict)
            or set(before) != set(values)
            or any(
                jsonable_encoder(getattr(child, field)) != value
                for field, value in before.items()
            )
        ):
            return "Governed Vendor child edit payload is stale"
        if spec.assert_edit_chain is not None:
            await spec.assert_edit_chain(db, vendor.id, child, values)
        changes = spec.update_changes(child, values)
        for field, value in values.items():
            setattr(child, field, value)
        await spec.emit_updated(db, resolver, child, changes)
    elif action == "archive":
        if (
            child is None
            or child.is_archived
            or before != {"is_archived": False}
            or after != {"is_archived": True}
        ):
            return "Governed Vendor child archive became stale"
        changes = spec.archive_changes(child)
        child.mark_archived(resolver)
        await spec.emit_archived(db, resolver, child, changes)
    else:
        raise ValidationError("Unsupported governed Vendor child operation")
    return None


async def approve_vendor_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    approval, proposal, locks = await _load_envelope(db, approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(
            f"Cannot resolve request with status: {approval.status.value}"
        )
    if proposal.mutation_kind == VENDOR_CREATE_KIND:
        await acquire_vendor_creation_name_lock(
            db,
            vendor_name=proposal.primary_resource_name,
        )
    resolver, requester, locked_vendor, stale_reason = await _live_policy(
        db,
        proposal=proposal,
        envelope_valid=valid_vendor_governed_envelope(proposal, locks),
        current_user=current_user,
    )
    if stale_reason:
        return await _expire(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=stale_reason,
            department_id=requester.department_id,
        )

    vendor: Vendor | None
    if proposal.mutation_kind == VENDOR_CREATE_KIND:
        try:
            payload = VendorCreate.model_validate(proposal.proposed_changes["after"])
        except (KeyError, TypeError, ValueError):
            payload = None
        if payload is None or locks:
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor creation payload is stale",
                department_id=requester.department_id,
            )
        expected_after = await _safe_vendor_creation_snapshot(
            db,
            jsonable_encoder(payload.model_dump(exclude={"request_reason"})),
        )
        expected_pending = {
            field: {"old": None, "new": expected_after[field]}
            for field in sorted(expected_after)
        }
        if (
            proposal.after_snapshot != expected_after
            or approval.pending_changes != expected_pending
        ):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor creation replay diverged from approval",
                department_id=payload.department_id,
            )
        await assert_vendor_create_allowed(
            db,
            current_user=requester,
            department_id=payload.department_id,
            owner_user_id=payload.outsourcing_owner_user_id,
        )
        duplicate = await db.scalar(
            select(Vendor.id).where(Vendor.name == payload.name).limit(1)
        )
        impact = await _creation_impact(db, payload)
        stale = bool(
            duplicate is not None
            or proposal.base_versions != {}
            or proposal.impacted_resources_snapshot != []
            or proposal.derived_impact_snapshot != {"before": None, "after": impact}
        )
        if stale:
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Protected Vendor creation changed after submission",
                department_id=payload.department_id,
            )
        vendor = Vendor(**payload.model_dump(exclude={"request_reason"}))
        db.add(vendor)
        await db.flush()
        await audit_vendor.vendor_created(db, actor=resolver, vendor=vendor)
        await finalize_governed_terminal_transition(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=locks,
            actor=resolver,
            department_id=vendor.department_id,
            status=ApprovalStatus.APPROVED,
            resolution_notes=resolution_notes,
            applied_changes=approval.pending_changes,
        )
    elif proposal.mutation_kind == VENDOR_EDIT_KIND:
        vendor = locked_vendor
        vendor_locks = [lock for lock in locks if lock.resource_type == "vendor"]
        orphan_locks = [
            lock for lock in locks if lock.resource_type == "orphaned_item"
        ]
        lock = vendor_locks[0] if len(vendor_locks) == 1 else None
        if (
            vendor is None
            or lock is None
            or lock.resource_type != "vendor"
            or lock.resource_id != vendor.id
            or lock.base_governance_version != vendor.governance_version
            or proposal.base_versions != {"vendor": vendor.governance_version}
        ):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor version changed after submission",
                department_id=vendor.department_id if vendor else requester.department_id,
            )
        await assert_vendor_update_allowed(
            db,
            vendor_id=vendor.id,
            current_user=requester,
        )
        raw_before = proposal.proposed_changes.get("before")
        raw_after = proposal.proposed_changes.get("after")
        try:
            replay = VendorUpdate.model_validate(raw_after)
            updates = replay.model_dump(
                exclude_unset=True,
                exclude={"request_reason"},
            )
        except (TypeError, ValueError):
            updates = {}
        if (
            not isinstance(raw_before, dict)
            or not isinstance(raw_after, dict)
            or not updates
            or set(raw_before) != set(updates)
            or set(raw_after) != set(updates)
            or any(
                jsonable_encoder(getattr(vendor, field)) != value
                for field, value in raw_before.items()
            )
        ):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor edit payload is stale",
                department_id=vendor.department_id,
            )
        expected_before, expected_after = await _safe_vendor_edit_snapshots(
            db,
            vendor=vendor,
            raw_after=jsonable_encoder(updates),
        )
        expected_pending = {
            field: {
                "old": expected_before.get(field),
                "new": expected_after.get(field),
            }
            for field in sorted(set(expected_before) | set(expected_after))
            if expected_before.get(field) != expected_after.get(field)
        }
        if (
            proposal.before_snapshot != expected_before
            or proposal.after_snapshot != expected_after
            or approval.pending_changes != expected_pending
        ):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor edit payload is stale",
                department_id=vendor.department_id,
            )
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
            if (
                orphan_lock is None
                or governed_orphan is None
                or governed_orphan.item_type != "vendor"
                or governed_orphan.item_id != vendor.id
                or governed_orphan.status != "pending"
                or governed_orphan.responsibility_role != "outsourcing_owner"
                or governed_orphan.previous_owner_id
                != orphan_lock.base_governance_version
                or raw_before.get("outsourcing_owner_user_id")
                != orphan_lock.base_governance_version
                or "outsourcing_owner_user_id" not in updates
            ):
                return await _expire(
                    db,
                    approval=approval,
                    proposal=proposal,
                    locks=locks,
                    actor=resolver,
                    reason="Orphaned Vendor evidence changed after submission",
                    department_id=vendor.department_id,
                )
        elif (
            raw_before.get("outsourcing_owner_user_id")
            != updates.get("outsourcing_owner_user_id")
        ):
            governed_orphan = (
                await db.execute(
                    select(OrphanedItem)
                    .where(
                        OrphanedItem.item_type == "vendor",
                        OrphanedItem.item_id == vendor.id,
                        OrphanedItem.status == "pending",
                        OrphanedItem.responsibility_role
                        == "outsourcing_owner",
                        OrphanedItem.previous_owner_id
                        == raw_before.get("outsourcing_owner_user_id"),
                    )
                    .order_by(OrphanedItem.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars().first()
        await assert_vendor_governance_update_allowed(
            db,
            current_user=requester,
            vendor=vendor,
            updates=updates,
        )
        current_impact, proposed_impact = await _existing_vendor_impacts(
            db,
            vendor=vendor,
            updates=updates,
        )
        if proposal.derived_impact_snapshot != {
            "before": current_impact,
            "after": proposed_impact,
        }:
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Protected Vendor derivation changed after submission",
                department_id=vendor.department_id,
            )
        changes = audit_vendor.vendor_update_changes(vendor, updates)
        for field, value in updates.items():
            setattr(vendor, field, value.value if hasattr(value, "value") else value)
        vendor.governance_version += 1
        if governed_orphan is not None:
            governed_orphan.status = "resolved"
            governed_orphan.resolved_at = utc_now()
            governed_orphan.resolved_by_id = resolver.id
            governed_orphan.new_owner_id = int(updates["outsourcing_owner_user_id"])
        await audit_vendor.vendor_updated(
            db,
            actor=resolver,
            vendor=vendor,
            changes=changes,
        )
        await finalize_governed_terminal_transition(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=locks,
            actor=resolver,
            department_id=vendor.department_id,
            status=ApprovalStatus.APPROVED,
            resolution_notes=resolution_notes,
            applied_changes=approval.pending_changes,
        )
    elif proposal.mutation_kind == VENDOR_ARCHIVE_KIND:
        vendor = locked_vendor
        lock = locks[0] if len(locks) == 1 else None
        if (
            vendor is None
            or vendor.is_archived
            or lock is None
            or lock.resource_type != "vendor"
            or lock.resource_id != vendor.id
            or lock.base_governance_version != vendor.governance_version
            or proposal.base_versions != {"vendor": vendor.governance_version}
        ):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor archive changed after submission",
                department_id=vendor.department_id if vendor else requester.department_id,
            )
        await assert_vendor_archive_allowed(
            db,
            vendor_id=vendor.id,
            current_user=requester,
        )
        changes = audit_vendor.vendor_archive_changes(vendor)
        vendor.mark_archived(resolver)
        vendor.governance_version += 1
        await audit_vendor.vendor_archived(
            db,
            actor=resolver,
            vendor=vendor,
            changes=changes,
        )
        await finalize_governed_terminal_transition(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=locks,
            actor=resolver,
            department_id=vendor.department_id,
            status=ApprovalStatus.APPROVED,
            resolution_notes=resolution_notes,
            applied_changes=approval.pending_changes,
        )
    elif proposal.mutation_kind in VENDOR_RELATIONSHIP_KINDS:
        vendor = locked_vendor
        lock = locks[0] if len(locks) == 1 else None
        stale = bool(
            vendor is None
            or vendor.is_archived
            or lock is None
            or lock.resource_type != "vendor"
            or lock.resource_id != vendor.id
            or lock.base_governance_version != vendor.governance_version
            or proposal.base_versions != {"vendor": vendor.governance_version}
        )
        operation = proposal.proposed_changes.get("operation")
        if stale or not isinstance(operation, dict):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor relationship became stale",
                department_id=vendor.department_id if vendor else requester.department_id,
            )
        assert vendor is not None
        current_impact, _ = await _existing_vendor_impacts(
            db,
            vendor=vendor,
            updates={},
        )
        if proposal.derived_impact_snapshot != {
            "before": current_impact,
            "after": current_impact,
        }:
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Protected Vendor relationship derivation changed after submission",
                department_id=vendor.department_id,
            )
        entity_id = operation.get("entity_id")
        entity_name = operation.get("entity_name")
        _, _, resource, action = proposal.mutation_kind.split(".")
        if not isinstance(entity_id, int) or not isinstance(entity_name, str):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor relationship payload is stale",
                department_id=vendor.department_id,
            )
        from app.services._vendor_governance.links import get_existing_link
        from app.services._vendor_links.workflow import (
            VendorLinkKind,
            link_vendor_target_no_commit,
            unlink_vendor_target_no_commit,
            vendor_link_target,
            visible_vendor_link_target_label,
        )

        # Invariant: mutation_kind is in VENDOR_RELATIONSHIP_KINDS (checked above),
        # so its resource segment is one of "risk" | "control" | "kri".
        link_kind = cast(VendorLinkKind, resource)
        target = vendor_link_target(link_kind)
        try:
            live_entity_name = await visible_vendor_link_target_label(
                db,
                current_user=requester,
                target=target,
                entity_id=entity_id,
                require_live=action == "add",
            )
        except (ConflictError, HTTPException):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor relationship target is no longer authorized",
                department_id=vendor.department_id,
            )
        if live_entity_name != entity_name:
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor relationship target changed after submission",
                department_id=vendor.department_id,
            )
        existing = await get_existing_link(
            db,
            target.link_model,
            vendor.id,
            target.entity_field,
            entity_id,
        )
        if (action == "add" and existing is not None) or (
            action == "remove" and existing is None
        ):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor relationship state changed after submission",
                department_id=vendor.department_id,
            )
        if action == "add":
            await link_vendor_target_no_commit(
                db,
                vendor_id=vendor.id,
                current_user=requester,
                audit_actor=resolver,
                kind=link_kind,
                entity_id=entity_id,
            )
        else:
            await unlink_vendor_target_no_commit(
                db,
                vendor_id=vendor.id,
                current_user=requester,
                audit_actor=resolver,
                kind=link_kind,
                entity_id=entity_id,
            )
        vendor.governance_version += 1
        await finalize_governed_terminal_transition(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=locks,
            actor=resolver,
            department_id=vendor.department_id,
            status=ApprovalStatus.APPROVED,
            resolution_notes=resolution_notes,
            applied_changes=approval.pending_changes,
        )
    elif proposal.mutation_kind in VENDOR_CHILD_KINDS:
        vendor = locked_vendor
        lock = locks[0] if len(locks) == 1 else None
        stale = bool(
            vendor is None
            or vendor.is_archived
            or lock is None
            or lock.resource_type != "vendor"
            or lock.resource_id != vendor.id
            or lock.base_governance_version != vendor.governance_version
            or proposal.base_versions != {"vendor": vendor.governance_version}
        )
        operation = proposal.proposed_changes.get("operation")
        if stale or not isinstance(operation, dict):
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Governed Vendor child mutation became stale",
                department_id=vendor.department_id if vendor else requester.department_id,
            )
        assert vendor is not None
        current_impact, _ = await _existing_vendor_impacts(
            db,
            vendor=vendor,
            updates={},
        )
        if proposal.derived_impact_snapshot != {
            "before": current_impact,
            "after": current_impact,
        }:
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason="Protected Vendor child derivation changed after submission",
                department_id=vendor.department_id,
            )
        child_id = operation.get("child_id")
        before = operation.get("before")
        after = operation.get("after")
        resource, action = proposal.mutation_kind.removeprefix("vendor.").split(".")
        if resource == "contract":
            stale_child_reason = await _apply_child_mutation(
                db,
                spec=_CONTRACT_LINEAGE,
                action=action,
                vendor=vendor,
                resolver=resolver,
                child_id=child_id,
                before=before,
                after=after,
            )
        else:
            # Canonical-order anchor: Vendor row FOR UPDATE (taken in _live_policy) before the
            # chain advisory lock; the direct lifecycle paths mirror it (sub_outsourcing_lifecycle.py).
            await acquire_sub_outsourcing_chain_lock(db, vendor_id=vendor.id)
            stale_child_reason = await _apply_child_mutation(
                db,
                spec=_SUB_OUTSOURCING_LINEAGE,
                action=action,
                vendor=vendor,
                resolver=resolver,
                child_id=child_id,
                before=before,
                after=after,
            )
        if stale_child_reason is not None:
            return await _expire(
                db,
                approval=approval,
                proposal=proposal,
                locks=locks,
                actor=resolver,
                reason=stale_child_reason,
                department_id=vendor.department_id,
            )
        vendor.governance_version += 1
        await finalize_governed_terminal_transition(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=locks,
            actor=resolver,
            department_id=vendor.department_id,
            status=ApprovalStatus.APPROVED,
            resolution_notes=resolution_notes,
            applied_changes=approval.pending_changes,
        )
    else:
        raise ValidationError("Unsupported governed Vendor mutation")

    await commit_service_boundary(db, boundary="governed_mutation.vendor.resolve")
    return await _reload(db, approval.id)


async def cancel_vendor_mutation(
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
            "Only the requester may cancel a governed Vendor mutation request"
        )
    vendor = (
        await db.get(Vendor, proposal.primary_resource_id)
        if proposal.primary_resource_id is not None
        else None
    )
    if not valid_vendor_governed_envelope(proposal, locks):
        return await _expire(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=current_user,
            reason="Governed Vendor approval envelope is malformed",
            department_id=(
                vendor.department_id if vendor else current_user.department_id
            ),
        )
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=current_user,
        department_id=vendor.department_id if vendor else current_user.department_id,
        status=ApprovalStatus.CANCELLED,
        resolution_notes="Cancelled by requester",
    )
    await commit_service_boundary(db, boundary="governed_mutation.vendor.cancel")
    return await _reload(db, approval.id)


async def reject_vendor_mutation(
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
    resolver, requester, vendor, stale_reason = await _live_policy(
        db,
        proposal=proposal,
        envelope_valid=valid_vendor_governed_envelope(proposal, locks),
        current_user=current_user,
    )
    if stale_reason:
        return await _expire(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=stale_reason,
            department_id=requester.department_id,
        )
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=resolver,
        department_id=vendor.department_id if vendor else requester.department_id,
        status=ApprovalStatus.REJECTED,
        resolution_notes=resolution_notes,
    )
    await commit_service_boundary(db, boundary="governed_mutation.vendor.reject")
    return await _reload(db, approval.id)


__all__ = [
    "approve_vendor_mutation",
    "cancel_vendor_mutation",
    "reject_vendor_mutation",
]
