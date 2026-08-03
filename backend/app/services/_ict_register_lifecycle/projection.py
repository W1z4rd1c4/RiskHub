from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.permissions import visible_vendor_ids
from app.core.security import check_permission
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    Process,
    ProcessVendorLink,
    User,
)
from app.schemas.process import (
    ProcessDepartmentRead,
    ProcessDerived,
    ProcessListCapabilities,
    ProcessListResponse,
    ProcessOwnerRead,
    ProcessPendingChange,
    ProcessPendingCreationCapabilities,
    ProcessPendingCreationRead,
    ProcessRead,
)
from app.services._authorization_capabilities import process_capabilities
from app.services._governed_mutations.process_identity import (
    InvalidGovernedProcessIdentity,
    canonical_process_display_name,
    strict_governed_process_identity,
)
from app.services._governed_mutations.process_mutations import (
    PROCESS_CREATE_KIND,
    ExtendedProcessMutationIdentity,
    is_extended_process_kind,
    strict_extended_process_identity,
)
from app.services._governed_mutations.projection import actor_safe_process_snapshots
from app.services._ict_register_reference.parameters import (
    IctWorkbookParameterSet,
    load_ict_workbook_parameter_set,
    load_ict_workbook_parameter_set_for_update,
)
from app.services.approval_scenario_policy import (
    can_resolve_extended_process_approval,
    load_approval_scenario_policy,
)

from .derivation import (
    ANO,
    BCM_GAP,
    CHECK_OK,
    CRITICALITY_CLASSES,
    NE,
    RTO_MTPD_GAP,
    derive_ict_register,
)
from .derivation_inputs import load_ict_register_graph, process_derivation_input
from .policy import can_read_process_record, can_use_process_assignment_lookup

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


_PROCESS_CRITICALITY_CODE_BY_ENGINE_VALUE = dict(
    zip(CRITICALITY_CLASSES, ("low", "medium", "high", "critical"), strict=True)
)
_PROCESS_CIF_CODE_BY_ENGINE_VALUE = {ANO: "yes", NE: "no"}
_PROCESS_RTO_MTPD_CHECK_CODE_BY_ENGINE_VALUE = {
    CHECK_OK: "ok",
    RTO_MTPD_GAP: "rto_exceeds_mtpd",
}
_PROCESS_BCM_CHECK_CODE_BY_ENGINE_VALUE = {
    CHECK_OK: "ok",
    BCM_GAP: "cif_without_bcm",
}
_PROTECTED_PROCESS_EDIT_SCENARIO_KEY = "protected_process_edit"


def _pending_process_composite_derived_impact(
    value: dict,
    *,
    process_labels: dict[int, str],
    asset_labels: dict[int, str],
    vendor_labels: dict[int, str],
) -> dict[str, list[dict[str, object]]]:
    safe: dict[str, list[dict[str, object]]] = {}
    for group, labels, fallback in (
        ("processes", process_labels, "Restricted Process"),
        ("assets", asset_labels, "Restricted Asset"),
        ("vendors", vendor_labels, "Restricted Vendor"),
    ):
        rows = value.get(group)
        if not isinstance(rows, list):
            continue
        safe[group] = [
            {
                "resource_name": labels.get(row.get("resource_id"), fallback),
                "before": row.get("before"),
                "after": row.get("after"),
            }
            for row in rows
            if isinstance(row, dict)
        ]
    return safe


async def protected_process_changes_require_approval(db: "AsyncSession") -> bool:
    """Project the live fixed-scenario switch used by Process mutation intake."""
    policy = await load_approval_scenario_policy(
        db,
        _PROTECTED_PROCESS_EDIT_SCENARIO_KEY,
        default_roles=("risk_manager", "cro"),
        default_requires_approval=True,
    )
    return policy.requires_approval


async def load_visible_pending_process_creations(
    db: "AsyncSession",
    *,
    current_user: User,
    department_ids: tuple[int, ...] = (),
) -> list[ProcessPendingCreationRead]:
    """Project non-operational create proposals for requester/eligible approvers.

    These rows are intentionally loaded independently from operational Process
    listing candidates, so they cannot influence totals, facets, groups,
    exports, relationship queries, or Department health.
    """
    rows = list(
        (
            await db.execute(
                select(GovernedMutationProposal)
                .options(
                    selectinload(GovernedMutationProposal.approval_request),
                    selectinload(GovernedMutationProposal.requested_by),
                    selectinload(GovernedMutationProposal.impact_locks),
                )
                .join(GovernedMutationProposal.approval_request)
                .where(
                    GovernedMutationProposal.mutation_kind == PROCESS_CREATE_KIND,
                    GovernedMutationProposal.primary_resource_type == "process",
                    GovernedMutationProposal.primary_resource_id.is_(None),
                    ApprovalRequest.resource_id.is_(None),
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                )
                .order_by(ApprovalRequest.created_at.desc(), ApprovalRequest.id.desc())
            )
        )
        .scalars()
        .unique()
        .all()
    )
    projected: list[ProcessPendingCreationRead] = []
    for proposal in rows:
        try:
            identity = strict_extended_process_identity(proposal)
        except ValueError:
            continue
        if identity is None or identity.mutation_kind != PROCESS_CREATE_KIND:
            continue
        proposed_after = proposal.proposed_changes["after"]
        if department_ids and proposed_after["owning_department_id"] not in department_ids:
            continue
        is_requester = identity.requested_by_id == current_user.id
        is_eligible_approver = can_resolve_extended_process_approval(
            current_user,
            proposal,
            requester_id=identity.requested_by_id,
            configured_roles=identity.approver_roles,
            process=None,
        )
        if not is_requester and not is_eligible_approver:
            continue
        approval = proposal.approval_request
        derived_after = proposal.derived_impact_snapshot.get("after")
        if not isinstance(derived_after, dict):
            continue
        projected.append(
            ProcessPendingCreationRead(
                approval_id=approval.id,
                proposal_id=proposal.proposal_id,
                proposal_version=proposal.proposal_version,
                requested_at=approval.created_at,
                requested_by_name=(proposal.requested_by.name if proposal.requested_by else None),
                reason=approval.reason,
                proposed=dict(proposal.after_snapshot),
                derived={
                    "cif": derived_after.get("cif"),
                    "criticality_class": derived_after.get("criticality_class"),
                },
                capabilities=ProcessPendingCreationCapabilities(
                    can_cancel=is_requester,
                    is_requester=is_requester,
                    can_resolve=is_eligible_approver,
                ),
            )
        )
    return projected


def _required_engine_code(mapping: dict[str, str], value: str, *, field: str) -> str:
    """Translate one closed engine value to its Process API code, failing closed."""
    try:
        return mapping[value]
    except KeyError as exc:
        raise ValueError(f"Unsupported engine Process {field} value: {value!r}") from exc


def _optional_engine_code(
    mapping: dict[str, str],
    value: str | None,
    *,
    field: str,
) -> str | None:
    if value is None:
        return None
    return _required_engine_code(mapping, value, field=field)


def _canonical_process_derived_block(engine_block: object) -> ProcessDerived:
    """Project workbook-native engine values into the canonical Process API."""
    block = ProcessDerived.model_validate(engine_block)
    transitive_links = [
        link.model_copy(
            update={
                "process_cif": _optional_engine_code(
                    _PROCESS_CIF_CODE_BY_ENGINE_VALUE,
                    link.process_cif,
                    field="transitive process_cif",
                ),
                "process_criticality": _optional_engine_code(
                    _PROCESS_CRITICALITY_CODE_BY_ENGINE_VALUE,
                    link.process_criticality,
                    field="transitive process_criticality",
                ),
            }
        )
        for link in block.transitive_vendor_links
    ]
    return block.model_copy(
        update={
            "criticality_class": _optional_engine_code(
                _PROCESS_CRITICALITY_CODE_BY_ENGINE_VALUE,
                block.criticality_class,
                field="criticality_class",
            ),
            "cif": _required_engine_code(
                _PROCESS_CIF_CODE_BY_ENGINE_VALUE,
                block.cif,
                field="cif",
            ),
            "rto_mtpd_check": _optional_engine_code(
                _PROCESS_RTO_MTPD_CHECK_CODE_BY_ENGINE_VALUE,
                block.rto_mtpd_check,
                field="rto_mtpd_check",
            ),
            "bcm_check": _required_engine_code(
                _PROCESS_BCM_CHECK_CODE_BY_ENGINE_VALUE,
                block.bcm_check,
                field="bcm_check",
            ),
            "transitive_vendor_links": transitive_links,
        }
    )


async def load_process_derived_blocks(
    db: "AsyncSession", processes: list[Process], *, current_user: User
) -> dict[int, ProcessDerived]:
    """Compute the engine-derived block for each Process (compute-on-read).

    One parameter-set load and one graph load per page — register scale is
    hundreds of rows, and the workbook itself recomputes on every open.
    """
    if not processes:
        return {}
    parameters = await load_ict_workbook_parameter_set(db)
    graph = await load_ict_register_graph(db, processes=processes)
    derivation = derive_ict_register(graph, parameters)
    blocks = {process.id: _canonical_process_derived_block(derivation.processes[process.id]) for process in processes}
    return await _filter_linked_context(
        db,
        current_user=current_user,
        blocks=blocks,
    )


async def load_proposed_process_derived_block(
    db: "AsyncSession",
    process: Process,
    *,
    updates: dict[str, object],
) -> ProcessDerived:
    """Derive a proposed Process without mutating the operational ORM row."""
    parameters = await load_ict_workbook_parameter_set(db)
    graph = await load_ict_register_graph(db, processes=[process])
    current = process_derivation_input(process)
    derivation_fields = set(current.__dataclass_fields__)
    proposed_values = {key: value for key, value in updates.items() if key in derivation_fields}
    proposed = replace(current, **proposed_values)
    proposed_graph = replace(
        graph,
        processes=tuple(proposed if row.id == process.id else row for row in graph.processes),
    )
    return _canonical_process_derived_block(derive_ict_register(proposed_graph, parameters).processes[process.id])


async def load_governed_process_derived_blocks(
    db: "AsyncSession",
    process: Process,
    *,
    updates: dict[str, object],
    parameters: IctWorkbookParameterSet | None = None,
) -> tuple[ProcessDerived, ProcessDerived]:
    """Derive current/proposed state from one locked parameter and graph snapshot."""
    if parameters is None:
        parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, processes=[process])
    current = process_derivation_input(process)
    derivation_fields = set(current.__dataclass_fields__)
    proposed = replace(
        current,
        **{key: value for key, value in updates.items() if key in derivation_fields},
    )
    proposed_graph = replace(
        graph,
        processes=tuple(proposed if row.id == process.id else row for row in graph.processes),
    )
    current_derivation = derive_ict_register(graph, parameters).processes[process.id]
    proposed_derivation = derive_ict_register(proposed_graph, parameters).processes[process.id]
    return (
        _canonical_process_derived_block(current_derivation),
        _canonical_process_derived_block(proposed_derivation),
    )


async def load_pending_process_changes(
    db: "AsyncSession",
    *,
    process_ids: list[int],
    current_user: User,
) -> dict[int, ProcessPendingChange]:
    if not process_ids:
        return {}
    rows = (
        (
            await db.execute(
                select(GovernedMutationProposal)
                .options(
                    selectinload(GovernedMutationProposal.approval_request),
                    selectinload(GovernedMutationProposal.requested_by),
                )
                .join(GovernedMutationImpactLock)
                .join(GovernedMutationProposal.approval_request)
                .where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id.in_(process_ids),
                    GovernedMutationImpactLock.released_at.is_(None),
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                )
            )
        )
        .scalars()
        .unique()
        .all()
    )
    can_view_proposed_references = await can_use_process_assignment_lookup(
        db,
        current_user=current_user,
    )
    parsed: list[
        tuple[
            GovernedMutationProposal,
            object,
            set[int],
        ]
    ] = []
    relationship_derived_process_ids: set[int] = set()
    for proposal in rows:
        if is_extended_process_kind(proposal.mutation_kind):
            try:
                identity = strict_extended_process_identity(proposal)
            except ValueError:
                continue
        else:
            try:
                identity = strict_governed_process_identity(proposal)
            except InvalidGovernedProcessIdentity:
                continue
        if identity is None:
            continue
        active_locked_process_ids = {
            lock.resource_id
            for lock in proposal.impact_locks
            if lock.resource_type == "process" and lock.released_at is None
        }
        if isinstance(proposal.derived_impact_snapshot, dict):
            derived_processes = proposal.derived_impact_snapshot.get("processes")
            if isinstance(derived_processes, list):
                relationship_derived_process_ids.update(
                    row["resource_id"]
                    for row in derived_processes
                    if isinstance(row, dict) and type(row.get("resource_id")) is int
                )
        if isinstance(identity, ExtendedProcessMutationIdentity):
            impacted_process_ids = {
                resource["resource_id"]
                for resource in proposal.impacted_resources_snapshot
                if isinstance(resource, dict)
                and resource.get("resource_type") == "process"
                and type(resource.get("resource_id")) is int
            }
            if identity.mutation_kind.startswith("process.link."):
                relationship_derived_process_ids.update(impacted_process_ids)
        parsed.append((proposal, identity, active_locked_process_ids & set(process_ids)))

    readable_process_labels: dict[int, str] = {}
    if relationship_derived_process_ids:
        impacted_processes = list(
            (await db.execute(select(Process).where(Process.id.in_(relationship_derived_process_ids)))).scalars().all()
        )
        readable_process_labels = {
            process.id: canonical_process_display_name(process.f_code, process.l1_process)
            for process in impacted_processes
            if can_read_process_record(current_user, process)
        }

    from app.services._approval_queue.projection import governed_process_actor_safe_labels

    for proposal, _, _ in parsed:
        set_committed_value(
            proposal.approval_request,
            "governed_mutation_proposal",
            proposal,
        )
    safe_labels = await governed_process_actor_safe_labels(
        db,
        approvals=[proposal.approval_request for proposal, _, _ in parsed],
        current_user=current_user,
    )

    projections: dict[int, ProcessPendingChange] = {}
    for proposal, identity, affected_process_ids in parsed:
        if not affected_process_ids:
            continue
        approval = proposal.approval_request
        if isinstance(identity, ExtendedProcessMutationIdentity):
            before = dict(proposal.before_snapshot)
            after = dict(proposal.after_snapshot)
            if identity.mutation_kind.startswith("process.link."):
                derived_impact = {
                    "processes": [
                        {
                            "resource_name": readable_process_labels.get(
                                row["resource_id"],
                                "Restricted Process",
                            ),
                            "before": row["before"],
                            "after": row["after"],
                        }
                        for row in proposal.derived_impact_snapshot["processes"]
                    ]
                }
            else:
                derived_impact = dict(proposal.derived_impact_snapshot)
        else:
            before, after = actor_safe_process_snapshots(
                proposal,
                can_view_proposed_references=can_view_proposed_references,
            )
            if "processes" in proposal.derived_impact_snapshot:
                labels = safe_labels.get(approval.id)
                derived_impact = _pending_process_composite_derived_impact(
                    proposal.derived_impact_snapshot,
                    process_labels=labels.process_labels if labels is not None else {},
                    asset_labels=labels.asset_labels if labels is not None else {},
                    vendor_labels=labels.vendor_labels if labels is not None else {},
                )
            else:
                derived_impact = proposal.derived_impact_snapshot
        pending = ProcessPendingChange(
            approval_id=approval.id,
            proposal_id=proposal.proposal_id,
            proposal_version=proposal.proposal_version,
            requested_at=approval.created_at,
            requested_by_name=(proposal.requested_by.name if proposal.requested_by else None),
            reason=approval.reason,
            before=before,
            after=after,
            derived_impact=derived_impact,
            capabilities={
                "can_view_diff": True,
                "can_cancel": identity.requested_by_id == current_user.id,
            },
        )
        for process_id in affected_process_ids:
            projections[process_id] = pending
    return projections


async def _filter_linked_context(
    db: "AsyncSession",
    *,
    current_user: User,
    blocks: dict[int, ProcessDerived],
) -> dict[int, ProcessDerived]:
    """Keep only linked-register context the caller can independently read.

    Process assignment grants record-specific Process access, not Asset or
    Vendor access. The derivation engine intentionally computes over the full
    register graph, so its result must be reduced at the API projection
    boundary before names, identifiers, or even relationship counts are
    returned to a scoped caller.
    """
    if not blocks:
        return blocks

    can_read_assets = check_permission(current_user, "assets", "read")
    can_read_vendors = check_permission(current_user, "vendors", "read")

    manual_vendor_ids: dict[int, list[int]] = defaultdict(list)
    candidate_vendor_ids = {link.vendor_id for block in blocks.values() for link in block.transitive_vendor_links}
    if can_read_vendors:
        rows = await db.execute(
            select(ProcessVendorLink.process_id, ProcessVendorLink.vendor_id).where(
                ProcessVendorLink.process_id.in_(blocks)
            )
        )
        for process_id, vendor_id in rows.all():
            manual_vendor_ids[process_id].append(vendor_id)
            candidate_vendor_ids.add(vendor_id)

    readable_vendor_ids = (
        await visible_vendor_ids(db, current_user, candidate_vendor_ids) if can_read_vendors else set()
    )

    filtered: dict[int, ProcessDerived] = {}
    for process_id, block in blocks.items():
        visible_transitive_links = [
            link for link in block.transitive_vendor_links if can_read_assets and link.vendor_id in readable_vendor_ids
        ]
        visible_manual_vendor_count = sum(
            vendor_id in readable_vendor_ids for vendor_id in manual_vendor_ids.get(process_id, [])
        )
        visible_transitive_vendor_count = len(visible_transitive_links)
        filtered_inputs = block.inputs.model_copy(
            update={
                "manual_vendor_link_count": visible_manual_vendor_count,
                "transitive_vendor_pair_count": visible_transitive_vendor_count,
            }
        )
        filtered[process_id] = block.model_copy(
            update={
                "linked_asset_count": block.linked_asset_count if can_read_assets else 0,
                "linked_vendor_count": (visible_manual_vendor_count + visible_transitive_vendor_count),
                "inputs": filtered_inputs,
                "transitive_vendor_links": visible_transitive_links,
            }
        )
    return filtered


def serialize_process_detail(
    process: Process,
    *,
    current_user: User,
    protected_change_requires_approval: bool,
    derived: ProcessDerived | None = None,
    ownership_pending: bool = False,
    pending_change: ProcessPendingChange | None = None,
) -> ProcessRead:
    owner = process.process_owner
    department = process.owning_department
    owner_projection = None
    if owner is not None:
        owner_projection = ProcessOwnerRead(
            name=owner.name,
            email=owner.email,
            role_name=owner.role.name,
            department_name=owner.department.name if owner.department is not None else None,
        )
    department_projection = None
    if department is not None:
        department_projection = ProcessDepartmentRead(name=department.name, code=department.code)

    owner_is_valid = bool(owner is not None and owner.is_active)
    department_is_valid = bool(department is not None and department.is_active)
    if ownership_pending:
        ownership_status = "pending_governance"
    elif owner is None or department is None:
        ownership_status = "legacy_unassigned"
    elif owner_is_valid and department_is_valid:
        ownership_status = "assigned"
    else:
        ownership_status = "invalid_assignment"

    base = ProcessRead.model_validate(
        {column.name: getattr(process, column.name) for column in Process.__table__.columns}
    )
    return base.model_copy(
        update={
            "process_owner": owner_projection,
            "owning_department": department_projection,
            "owner_orphaned": ownership_pending,
            "ownership_status": ownership_status,
            "capabilities": process_capabilities(
                current_user,
                process,
                ownership_pending=ownership_pending,
                governed_mutation_pending=pending_change is not None,
                pending_requested_by_id=(
                    current_user.id if pending_change is not None and pending_change.capabilities.can_cancel else None
                ),
                protected_change_requires_approval=protected_change_requires_approval,
            ),
            "derived": derived,
            "pending_change": pending_change,
        }
    )


async def pending_process_ownership_orphan_ids(
    db: "AsyncSession",
    *,
    process_ids: list[int],
) -> set[int]:
    if not process_ids:
        return set()
    return set(
        (
            await db.execute(
                select(OrphanedItem.item_id).where(
                    OrphanedItem.item_type == "process",
                    OrphanedItem.item_id.in_(process_ids),
                    OrphanedItem.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )


async def serialize_process_detail_with_derived(
    db: "AsyncSession",
    process: Process,
    *,
    current_user: User,
) -> ProcessRead:
    blocks = await load_process_derived_blocks(db, [process], current_user=current_user)
    pending_ids = await pending_process_ownership_orphan_ids(db, process_ids=[process.id])
    pending_changes = await load_pending_process_changes(db, process_ids=[process.id], current_user=current_user)
    protected_change_requires_approval = await protected_process_changes_require_approval(db)
    return serialize_process_detail(
        process,
        current_user=current_user,
        derived=blocks[process.id],
        ownership_pending=process.id in pending_ids,
        pending_change=pending_changes.get(process.id),
        protected_change_requires_approval=protected_change_requires_approval,
    )


def build_process_collection_capabilities(current_user: User) -> ProcessListCapabilities:
    return ProcessListCapabilities(can_create=check_permission(current_user, "processes", "write"))


async def serialize_process_list(
    db: "AsyncSession",
    processes: list[Process],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
) -> ProcessListResponse:
    blocks = await load_process_derived_blocks(db, processes, current_user=current_user)
    pending_ids = await pending_process_ownership_orphan_ids(
        db,
        process_ids=[process.id for process in processes],
    )
    pending_changes = await load_pending_process_changes(
        db,
        process_ids=[process.id for process in processes],
        current_user=current_user,
    )
    protected_change_requires_approval = await protected_process_changes_require_approval(db)
    return ProcessListResponse(
        items=[
            serialize_process_detail(
                process,
                current_user=current_user,
                derived=blocks.get(process.id),
                ownership_pending=process.id in pending_ids,
                pending_change=pending_changes.get(process.id),
                protected_change_requires_approval=protected_change_requires_approval,
            )
            for process in processes
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_process_collection_capabilities(current_user),
    )
