from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.permissions import visible_vendor_ids
from app.core.security import check_permission
from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    Process,
    ProcessAssetLink,
    User,
    Vendor,
)
from app.schemas.asset import (
    AssetDepartmentRead,
    AssetDerived,
    AssetListCapabilities,
    AssetListResponse,
    AssetOwnerRead,
    AssetPendingChange,
    AssetRead,
)
from app.services._authorization_capabilities import asset_capabilities
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set

from ._derivation_impl import ARTICLE8_CRITICAL, ARTICLE8_NON_CRITICAL
from .asset_policy import asset_visibility_clause
from .derivation import (
    ANO,
    CRITICALITY_CLASSES,
    NE,
    IctRegisterGraph,
    derive_ict_register,
    process_display_name,
)
from .derivation_inputs import load_ict_register_graph
from .policy import process_visibility_clause

_ASSET_CRITICALITY_CODE_BY_ENGINE_VALUE = dict(
    zip(CRITICALITY_CLASSES, ("low", "medium", "high", "critical"), strict=True)
)
_ASSET_BOOLEAN_CODE_BY_ENGINE_VALUE = {ANO: "yes", NE: "no"}
_ASSET_ARTICLE8_CODE_BY_ENGINE_VALUE = {
    ARTICLE8_CRITICAL: "critical",
    ARTICLE8_NON_CRITICAL: "non_critical",
}


def _required_engine_code(mapping: dict[str, str], value: str, *, field: str) -> str:
    try:
        return mapping[value]
    except KeyError as exc:
        raise ValueError(f"Unsupported engine Asset {field} value: {value!r}") from exc


def _optional_engine_code(mapping: dict[str, str], value: str | None, *, field: str) -> str | None:
    if value is None:
        return None
    return _required_engine_code(mapping, value, field=field)


def _canonical_asset_derived_block(engine_block: object) -> AssetDerived:
    """Project workbook-native engine values into the canonical Asset API."""
    block = AssetDerived.model_validate(engine_block)
    return block.model_copy(
        update={
            "primary_process_criticality": _optional_engine_code(
                _ASSET_CRITICALITY_CODE_BY_ENGINE_VALUE,
                block.primary_process_criticality,
                field="primary_process_criticality",
            ),
            "business_criticality": _optional_engine_code(
                _ASSET_CRITICALITY_CODE_BY_ENGINE_VALUE,
                block.business_criticality,
                field="business_criticality",
            ),
            "score_criticality": _optional_engine_code(
                _ASSET_CRITICALITY_CODE_BY_ENGINE_VALUE,
                block.score_criticality,
                field="score_criticality",
            ),
            "resulting_criticality": _optional_engine_code(
                _ASSET_CRITICALITY_CODE_BY_ENGINE_VALUE,
                block.resulting_criticality,
                field="resulting_criticality",
            ),
            "article8_classification": _required_engine_code(
                _ASSET_ARTICLE8_CODE_BY_ENGINE_VALUE,
                block.article8_classification,
                field="article8_classification",
            ),
            "cif": _required_engine_code(_ASSET_BOOLEAN_CODE_BY_ENGINE_VALUE, block.cif, field="cif"),
            "spof": _required_engine_code(_ASSET_BOOLEAN_CODE_BY_ENGINE_VALUE, block.spof, field="spof"),
            "external_dependency": _required_engine_code(
                _ASSET_BOOLEAN_CODE_BY_ENGINE_VALUE,
                block.external_dependency,
                field="external_dependency",
            ),
            "legacy": _required_engine_code(_ASSET_BOOLEAN_CODE_BY_ENGINE_VALUE, block.legacy, field="legacy"),
        }
    )


async def load_primary_process_ids(db: AsyncSession, asset_ids: list[int], *, current_user: User) -> dict[int, int]:
    """Map Asset to its primary Process only when independently readable."""
    if not asset_ids:
        return {}
    query = (
        select(ProcessAssetLink.asset_id, ProcessAssetLink.process_id)
        .join(Process, Process.id == ProcessAssetLink.process_id)
        .where(
            ProcessAssetLink.asset_id.in_(asset_ids),
            ProcessAssetLink.is_primary.is_(True),
        )
    )
    visibility_clause = process_visibility_clause(current_user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    rows = await db.execute(query)
    return {asset_id: process_id for asset_id, process_id in rows.all()}


async def load_asset_derived_blocks(
    db: AsyncSession, assets: list[Asset], *, current_user: User
) -> dict[int, AssetDerived]:
    """Compute Asset results only from counterpart rows the viewer may read."""
    if not assets:
        return {}
    parameters = await load_ict_workbook_parameter_set(db)
    graph = await load_ict_register_graph(db, assets=assets)
    graph = await _viewer_filtered_asset_graph(
        db,
        graph=graph,
        target_asset_ids={asset.id for asset in assets},
        current_user=current_user,
    )
    derivation = derive_ict_register(graph, parameters)
    blocks = {asset.id: _canonical_asset_derived_block(derivation.assets[asset.id]) for asset in assets}
    return await _filter_asset_linked_context(
        db,
        assets=assets,
        current_user=current_user,
        blocks=blocks,
        process_derivations=derivation.processes,
    )


async def _viewer_filtered_asset_graph(
    db: AsyncSession,
    *,
    graph: IctRegisterGraph,
    target_asset_ids: set[int],
    current_user: User,
) -> IctRegisterGraph:
    """Remove unreadable counterpart rows before they can affect Asset formulas."""
    candidate_process_ids = {link.process_id for link in graph.process_asset_links if link.asset_id in target_asset_ids}
    process_query = select(Process.id).where(Process.id.in_(candidate_process_ids))
    process_clause = process_visibility_clause(current_user)
    if process_clause is not None:
        process_query = process_query.where(process_clause)
    visible_process_ids = set((await db.execute(process_query)).scalars().all()) if candidate_process_ids else set()

    candidate_supporting_ids = {
        link.supporting_asset_id for link in graph.asset_asset_links if link.dependent_asset_id in target_asset_ids
    }
    supporting_query = select(Asset.id).where(Asset.id.in_(candidate_supporting_ids))
    supporting_clause = asset_visibility_clause(current_user)
    if supporting_clause is not None:
        supporting_query = supporting_query.where(supporting_clause)
    visible_supporting_ids = (
        set((await db.execute(supporting_query)).scalars().all()) if candidate_supporting_ids else set()
    )

    candidate_vendor_ids = {link.vendor_id for link in graph.asset_vendor_links if link.asset_id in target_asset_ids}
    readable_vendor_ids = (
        await visible_vendor_ids(db, current_user, candidate_vendor_ids)
        if check_permission(current_user, "vendors", "read")
        else set()
    )
    retained_asset_ids = target_asset_ids | visible_supporting_ids
    return replace(
        graph,
        processes=tuple(process for process in graph.processes if process.id in visible_process_ids),
        assets=tuple(asset for asset in graph.assets if asset.id in retained_asset_ids),
        process_asset_links=tuple(
            link
            for link in graph.process_asset_links
            if link.asset_id in target_asset_ids and link.process_id in visible_process_ids
        ),
        asset_asset_links=tuple(
            link
            for link in graph.asset_asset_links
            if link.dependent_asset_id in target_asset_ids and link.supporting_asset_id in visible_supporting_ids
        ),
        asset_vendor_links=tuple(
            link
            for link in graph.asset_vendor_links
            if link.asset_id in target_asset_ids and link.vendor_id in readable_vendor_ids
        ),
        process_vendor_links=tuple(
            link
            for link in graph.process_vendor_links
            if link.process_id in visible_process_ids and link.vendor_id in readable_vendor_ids
        ),
        vendors=tuple(vendor for vendor in graph.vendors if vendor.id in readable_vendor_ids),
        contracts=tuple(contract for contract in graph.contracts if contract.vendor_id in readable_vendor_ids),
        sub_outsourcing=tuple(entry for entry in graph.sub_outsourcing if entry.vendor_id in readable_vendor_ids),
    )


async def _filter_asset_linked_context(
    db: AsyncSession,
    *,
    assets: list[Asset],
    current_user: User,
    blocks: dict[int, AssetDerived],
    process_derivations: Mapping[int, object],
) -> dict[int, AssetDerived]:
    """Filter linked labels, identifiers, and counts through counterpart policies."""
    asset_ids = {asset.id for asset in assets}
    process_rows = (
        await db.execute(
            select(
                ProcessAssetLink.asset_id,
                ProcessAssetLink.process_id,
                ProcessAssetLink.is_primary,
            )
            .where(ProcessAssetLink.asset_id.in_(asset_ids))
            .order_by(ProcessAssetLink.id)
        )
    ).all()
    candidate_process_ids = {row.process_id for row in process_rows}
    process_query = select(Process).where(Process.id.in_(candidate_process_ids))
    process_clause = process_visibility_clause(current_user)
    if process_clause is not None:
        process_query = process_query.where(process_clause)
    visible_processes = {process.id: process for process in (await db.execute(process_query)).scalars().all()}

    supporting_rows = (
        await db.execute(
            select(AssetAssetLink.dependent_asset_id, AssetAssetLink.supporting_asset_id)
            .where(AssetAssetLink.dependent_asset_id.in_(asset_ids))
            .order_by(AssetAssetLink.id)
        )
    ).all()
    candidate_supporting_ids = {row.supporting_asset_id for row in supporting_rows}
    supporting_query = select(Asset).where(Asset.id.in_(candidate_supporting_ids))
    supporting_visibility_clause = asset_visibility_clause(current_user)
    if supporting_visibility_clause is not None:
        supporting_query = supporting_query.where(supporting_visibility_clause)
    supporting_assets = {asset.id: asset for asset in (await db.execute(supporting_query)).scalars().all()}

    vendor_rows = (
        await db.execute(
            select(
                AssetVendorLink.asset_id,
                AssetVendorLink.vendor_id,
                AssetVendorLink.ict_service_code,
                AssetVendorLink.contract_reference,
            )
            .where(AssetVendorLink.asset_id.in_(asset_ids))
            .order_by(AssetVendorLink.id)
        )
    ).all()
    candidate_vendor_ids = {row.vendor_id for row in vendor_rows}
    readable_vendor_ids = (
        await visible_vendor_ids(db, current_user, candidate_vendor_ids)
        if check_permission(current_user, "vendors", "read")
        else set()
    )
    visible_vendors = {
        vendor.id: vendor
        for vendor in (await db.execute(select(Vendor).where(Vendor.id.in_(readable_vendor_ids)))).scalars().all()
    }

    filtered: dict[int, AssetDerived] = {}
    for asset in assets:
        block = blocks[asset.id]
        visible_process_rows = [
            row for row in process_rows if row.asset_id == asset.id and row.process_id in visible_processes
        ]
        visible_cif_processes = [
            visible_processes[row.process_id]
            for row in visible_process_rows
            if getattr(process_derivations.get(row.process_id), "cif", None) == ANO
        ]
        visible_primary = next(
            (visible_processes[row.process_id] for row in visible_process_rows if row.is_primary),
            None,
        )
        visible_supporting_assets = [
            supporting_assets[row.supporting_asset_id]
            for row in supporting_rows
            if row.dependent_asset_id == asset.id and row.supporting_asset_id in supporting_assets
        ]
        visible_vendor_rows = [
            row for row in vendor_rows if row.asset_id == asset.id and row.vendor_id in visible_vendors
        ]
        filtered_inputs = block.inputs.model_copy(
            update={"primary_process_id": visible_primary.id if visible_primary is not None else None}
        )
        filtered[asset.id] = block.model_copy(
            update={
                "primary_process_name": (
                    process_display_name(visible_primary.l1_process, visible_primary.l2_subprocess)
                    if visible_primary is not None
                    else None
                ),
                "primary_process_criticality": (
                    block.primary_process_criticality if visible_primary is not None else None
                ),
                "inherited_impact_operations": (
                    block.inherited_impact_operations if visible_primary is not None else None
                ),
                "inherited_impact_financial": (
                    block.inherited_impact_financial if visible_primary is not None else None
                ),
                "inherited_rto_hours": (block.inherited_rto_hours if visible_primary is not None else None),
                "cif_process_count": len(visible_cif_processes),
                "cif_process_names": [
                    process_display_name(process.l1_process, process.l2_subprocess) for process in visible_cif_processes
                ],
                "linked_process_count": len(visible_process_rows),
                "linked_vendor_count": len(visible_vendor_rows),
                "linked_asset_names": [linked_asset.name for linked_asset in visible_supporting_assets],
                "vendor_names": [visible_vendors[row.vendor_id].name for row in visible_vendor_rows],
                "ict_service_codes": [row.ict_service_code for row in visible_vendor_rows],
                "contract_references": [
                    row.contract_reference for row in visible_vendor_rows if row.contract_reference is not None
                ],
                "inputs": filtered_inputs,
            }
        )
    return filtered


def serialize_asset_detail(
    asset: Asset,
    *,
    current_user: User,
    primary_process_id: int | None,
    derived: AssetDerived | None = None,
    orphaned_roles: set[str] | None = None,
    pending_change: AssetPendingChange | None = None,
    has_pending_change: bool = False,
) -> AssetRead:
    orphaned_roles = orphaned_roles or set()

    def owner_projection(owner: User | None) -> AssetOwnerRead | None:
        if owner is None:
            return None
        return AssetOwnerRead(
            name=owner.name,
            role_name=owner.role.name,
            department_name=(owner.department.name if owner.department is not None else None),
        )

    department = asset.owning_department
    department_projection = (
        AssetDepartmentRead(name=department.name, code=department.code) if department is not None else None
    )
    business_owner_valid = bool(asset.business_owner is not None and asset.business_owner.is_active)
    ict_owner_valid = bool(asset.ict_owner is not None and asset.ict_owner.is_active)
    department_valid = bool(department is not None and department.is_active)
    if orphaned_roles:
        ownership_status = "pending_governance"
    elif asset.business_owner is None or asset.ict_owner is None or department is None:
        ownership_status = "legacy_unassigned"
    elif business_owner_valid and ict_owner_valid and department_valid:
        ownership_status = "assigned"
    else:
        ownership_status = "invalid_assignment"

    base = AssetRead.model_validate({column.name: getattr(asset, column.name) for column in Asset.__table__.columns})
    return base.model_copy(
        update={
            "business_owner": owner_projection(asset.business_owner),
            "ict_owner": owner_projection(asset.ict_owner),
            "owning_department": department_projection,
            "business_owner_orphaned": "business_owner" in orphaned_roles,
            "ict_owner_orphaned": "ict_owner" in orphaned_roles,
            "ownership_status": ownership_status,
            "capabilities": asset_capabilities(
                current_user,
                asset,
                ownership_pending=bool(orphaned_roles),
            ).model_copy(
                update={
                    "can_update": False
                    if has_pending_change
                    else asset_capabilities(current_user, asset, ownership_pending=bool(orphaned_roles)).can_update,
                    "can_archive": False
                    if has_pending_change
                    else asset_capabilities(current_user, asset, ownership_pending=bool(orphaned_roles)).can_archive,
                    "has_pending_change": has_pending_change,
                    "business_edit_blocked": has_pending_change,
                    "can_cancel_pending_change": bool(
                        pending_change is not None and pending_change.capabilities.can_cancel
                    ),
                }
            ),
            "primary_process_id": primary_process_id,
            "derived": derived,
            "pending_change": pending_change,
        }
    )


def _actor_safe_pending_asset_value(value: object) -> object:
    if isinstance(value, dict):
        return {
            str(key): _actor_safe_pending_asset_value(item)
            for key, item in value.items()
            if isinstance(key, str) and key != "id" and not key.endswith("_id")
        }
    if isinstance(value, list):
        return [_actor_safe_pending_asset_value(item) for item in value]
    return value


def _pending_asset_impacted_resources(
    proposal: GovernedMutationProposal,
    labels,
) -> list[dict[str, str]]:
    return [
        {
            "resource_type": str(item.get("resource_type") or "resource"),
            "resource_name": labels.asset_labels.get(
                item.get("resource_id"),
                f"Restricted {str(item.get('resource_type') or 'resource').title()}",
            ),
        }
        for item in proposal.impacted_resources_snapshot
        if isinstance(item, dict)
    ]


def _pending_asset_derived_impact(proposal: GovernedMutationProposal, labels) -> dict[str, object]:
    raw = proposal.derived_impact_snapshot
    if not isinstance(raw, dict) or not isinstance(raw.get("assets"), list):
        safe = _actor_safe_pending_asset_value(raw)
        return safe if isinstance(safe, dict) else {}
    safe = {
        str(key): _actor_safe_pending_asset_value(value)
        for key, value in raw.items()
        if key not in {"assets", "processes", "vendors"}
    }
    for key, names, fallback in (
        ("assets", labels.asset_labels, "Unknown Asset"),
        ("processes", labels.process_labels, "Restricted Process"),
        ("vendors", labels.vendor_labels, "Restricted Vendor"),
    ):
        rows = raw.get(key)
        if not isinstance(rows, list):
            continue
        safe[key] = [
            {
                "resource_name": names.get(item.get("resource_id"), fallback),
                "before": _actor_safe_pending_asset_value(item.get("before")),
                "after": _actor_safe_pending_asset_value(item.get("after")),
            }
            for item in rows
            if isinstance(item, dict)
        ]
    return safe


def _pending_asset_relationship_change(
    proposal: GovernedMutationProposal,
    labels,
) -> dict[str, object] | None:
    if not proposal.mutation_kind.startswith("asset.link."):
        return None
    operation = proposal.proposed_changes.get("operation")
    if not isinstance(operation, dict):
        return None
    target_type = proposal.mutation_kind.split(".")[2]
    target_name = labels.relationship_target_label or f"Restricted {target_type.title()}"
    before = _actor_safe_pending_asset_value(operation.get("before"))
    after = _actor_safe_pending_asset_value(operation.get("after"))
    return {
        "target_resource_type": target_type,
        "target_resource_name": target_name,
        "action": proposal.mutation_kind.rsplit(".", 1)[-1],
        "before": before if isinstance(before, dict) else {},
        "after": after if isinstance(after, dict) else {},
    }


async def load_pending_asset_changes(
    db: AsyncSession,
    *,
    asset_ids: list[int],
    current_user: User,
) -> tuple[dict[int, AssetPendingChange], set[int]]:
    if not asset_ids:
        return {}, set()
    proposals = list(
        (
            await db.execute(
                select(GovernedMutationProposal)
                .options(
                    selectinload(GovernedMutationProposal.approval_request),
                    selectinload(GovernedMutationProposal.requested_by),
                    selectinload(GovernedMutationProposal.impact_locks),
                )
                .join(GovernedMutationImpactLock)
                .join(GovernedMutationProposal.approval_request)
                .where(
                    GovernedMutationImpactLock.resource_type == "asset",
                    GovernedMutationImpactLock.resource_id.in_(asset_ids),
                    GovernedMutationImpactLock.released_at.is_(None),
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                )
            )
        )
        .scalars()
        .unique()
        .all()
    )
    for proposal in proposals:
        set_committed_value(
            proposal.approval_request,
            "governed_mutation_proposal",
            proposal,
        )
    from app.services._governed_mutations.asset_mutations import valid_asset_governed_envelope
    from app.services._governed_mutations.fixed_asset_policy import (
        is_live_eligible_asset_resolver,
    )
    from app.services._governed_mutations.process_identity import strict_governed_process_identity
    from app.services._governed_mutations.process_mutations import (
        ExtendedProcessMutationIdentity,
        is_extended_process_kind,
        strict_extended_process_identity,
    )

    result: dict[int, AssetPendingChange] = {}
    locked_asset_ids: set[int] = set()
    from app.services._approval_queue.projection import governed_process_actor_safe_labels

    safe_labels = await governed_process_actor_safe_labels(
        db,
        approvals=[proposal.approval_request for proposal in proposals],
        current_user=current_user,
    )
    for proposal in proposals:
        asset_identity = valid_asset_governed_envelope(proposal)
        try:
            process_identity = (
                strict_extended_process_identity(proposal)
                if is_extended_process_kind(proposal.mutation_kind)
                else strict_governed_process_identity(proposal)
            )
        except ValueError:
            process_identity = None
        if not asset_identity and process_identity is None:
            continue
        approval = proposal.approval_request
        labels = safe_labels.get(approval.id)
        proposal_asset_ids = {
            lock.resource_id
            for lock in proposal.impact_locks
            if lock.resource_type == "asset" and lock.released_at is None
        }
        locked_asset_ids.update(proposal_asset_ids & set(asset_ids))
        triggers = (
            process_identity.triggered_scenarios
            if isinstance(process_identity, ExtendedProcessMutationIdentity)
            else getattr(process_identity, "triggered_scenarios", (proposal.scenario_snapshot.get("key"),))
            if process_identity is not None
            else (proposal.scenario_snapshot.get("key"),)
        )
        scenario_rows = list(
            (await db.execute(select(ApprovalScenario).where(ApprovalScenario.key.in_(tuple(triggers))))).scalars()
        )
        # Keyed by scenario key; looked up with snapshot-sourced values, so the
        # lookup domain is wider than ``str`` (may include ``None``).
        scenarios: dict[Any, ApprovalScenario] = {scenario.key: scenario for scenario in scenario_rows}
        if asset_identity:
            live_resolver = is_live_eligible_asset_resolver(
                current_user,
                proposal,
                scenarios.get(proposal.scenario_snapshot.get("key")),
            )
        else:
            from app.services.approval_scenario_policy import (
                governed_process_response_policy,
            )

            response_policy = await governed_process_response_policy(
                db,
                approval=approval,
                user=current_user,
            )
            role_name = getattr(getattr(current_user, "role", None), "name", None)
            live_resolver = bool(
                response_policy
                and response_policy.can_resolve
                and all(
                    (scenario := scenarios.get(scenario_key)) is not None
                    and scenario.requires_approval
                    and role_name in (scenario.approver_roles or ())
                    for scenario_key in triggers
                )
            )
        can_view_snapshot = bool(current_user.id == proposal.requested_by_id or live_resolver)
        pending = AssetPendingChange(
            approval_id=approval.id if can_view_snapshot else None,
            proposal_id=proposal.proposal_id if can_view_snapshot else None,
            proposal_version=proposal.proposal_version if can_view_snapshot else None,
            requested_at=approval.created_at,
            requested_by_name=(proposal.requested_by.name if can_view_snapshot and proposal.requested_by else None),
            reason=approval.reason if can_view_snapshot else "",
            mutation_kind=proposal.mutation_kind if can_view_snapshot else None,
            before=(_actor_safe_pending_asset_value(proposal.before_snapshot) if can_view_snapshot else {}),
            after=(_actor_safe_pending_asset_value(proposal.after_snapshot) if can_view_snapshot else {}),
            derived_impact=(
                _pending_asset_derived_impact(proposal, labels) if can_view_snapshot and labels is not None else {}
            ),
            impacted_resources=(
                _pending_asset_impacted_resources(proposal, labels) if can_view_snapshot and labels is not None else []
            ),
            relationship_change=(
                _pending_asset_relationship_change(proposal, labels)
                if can_view_snapshot and labels is not None
                else None
            ),
            capabilities={
                "can_view_diff": can_view_snapshot,
                "can_cancel": proposal.requested_by_id == current_user.id,
            },
        )
        for locked_asset_id in proposal_asset_ids & set(asset_ids):
            result[locked_asset_id] = pending
    return result, locked_asset_ids


async def pending_asset_responsibility_roles(
    db: AsyncSession,
    *,
    asset_ids: list[int],
) -> dict[int, set[str]]:
    if not asset_ids:
        return {}
    rows = await db.execute(
        select(OrphanedItem.item_id, OrphanedItem.responsibility_role).where(
            OrphanedItem.item_type == "asset",
            OrphanedItem.item_id.in_(asset_ids),
            OrphanedItem.status == "pending",
        )
    )
    result: dict[int, set[str]] = {}
    for asset_id, role in rows.all():
        if role is not None:
            result.setdefault(asset_id, set()).add(role)
    return result


async def serialize_asset_detail_with_primary(
    db: AsyncSession,
    asset: Asset,
    *,
    current_user: User,
) -> AssetRead:
    primary_map = await load_primary_process_ids(db, [asset.id], current_user=current_user)
    blocks = await load_asset_derived_blocks(db, [asset], current_user=current_user)
    orphaned = await pending_asset_responsibility_roles(db, asset_ids=[asset.id])
    pending, pending_asset_ids = await load_pending_asset_changes(db, asset_ids=[asset.id], current_user=current_user)
    return serialize_asset_detail(
        asset,
        current_user=current_user,
        primary_process_id=primary_map.get(asset.id),
        derived=blocks[asset.id],
        orphaned_roles=orphaned.get(asset.id),
        pending_change=pending.get(asset.id),
        has_pending_change=asset.id in pending_asset_ids,
    )


def build_asset_collection_capabilities(current_user: User) -> AssetListCapabilities:
    return AssetListCapabilities(can_create=check_permission(current_user, "assets", "write"))


async def serialize_asset_list(
    db: AsyncSession,
    assets: list[Asset],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
) -> AssetListResponse:
    primary_map = await load_primary_process_ids(db, [asset.id for asset in assets], current_user=current_user)
    blocks = await load_asset_derived_blocks(db, assets, current_user=current_user)
    orphaned = await pending_asset_responsibility_roles(
        db,
        asset_ids=[asset.id for asset in assets],
    )
    pending, pending_asset_ids = await load_pending_asset_changes(
        db, asset_ids=[asset.id for asset in assets], current_user=current_user
    )
    return AssetListResponse(
        items=[
            serialize_asset_detail(
                asset,
                current_user=current_user,
                primary_process_id=primary_map.get(asset.id),
                derived=blocks.get(asset.id),
                orphaned_roles=orphaned.get(asset.id),
                pending_change=pending.get(asset.id),
                has_pending_change=asset.id in pending_asset_ids,
            )
            for asset in assets
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_asset_collection_capabilities(current_user),
    )
