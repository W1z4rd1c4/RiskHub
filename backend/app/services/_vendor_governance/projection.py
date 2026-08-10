from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.vendor import (
    _block_vendor_business_capabilities,
    vendor_list_response,
    vendor_to_read,
)
from app.core.permissions import get_user_department_ids, visible_risk_ids
from app.core.security import check_permission
from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    User,
    Vendor,
    VendorRiskLink,
)
from app.schemas.vendor import (
    VendorDerived,
    VendorLinkedRiskSummary,
    VendorListResponse,
    VendorPendingChange,
    VendorRead,
)
from app.services._ict_register_lifecycle.asset_policy import has_editable_asset_record
from app.services._ict_register_lifecycle.derivation import IctRegisterDerivation, derive_ict_register
from app.services._ict_register_lifecycle.derivation_inputs import load_ict_register_graph
from app.services._ict_register_lifecycle.policy import has_editable_process_record
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set
from app.services._ict_register_reference.vendor_values import canonicalize_vendor_derived


async def get_visible_vendor_risk_ids(
    db: AsyncSession,
    *,
    current_user: User,
    vendors: list[Vendor],
) -> set[int]:
    vendor_ids = {vendor.id for vendor in vendors}
    if not vendor_ids:
        return set()

    unique_risk_ids = set(
        (await db.execute(select(VendorRiskLink.risk_id).where(VendorRiskLink.vendor_id.in_(vendor_ids))))
        .scalars()
        .all()
    )
    if not unique_risk_ids:
        return set()

    return await visible_risk_ids(db, current_user, unique_risk_ids)


async def _load_vendor_owner_metadata(
    db: AsyncSession,
    vendors: list[Vendor],
) -> None:
    vendor_ids = [vendor.id for vendor in vendors]
    if not vendor_ids:
        return
    await db.execute(
        select(Vendor)
        .options(
            selectinload(Vendor.department),
            selectinload(Vendor.outsourcing_owner).selectinload(User.role),
            selectinload(Vendor.outsourcing_owner).selectinload(User.department),
        )
        .where(Vendor.id.in_(vendor_ids))
    )


async def pending_vendor_owner_orphan_ids(
    db: AsyncSession,
    *,
    vendor_ids: list[int],
) -> set[int]:
    if not vendor_ids:
        return set()
    return set(
        (
            await db.execute(
                select(OrphanedItem.item_id).where(
                    OrphanedItem.item_type == "vendor",
                    OrphanedItem.item_id.in_(vendor_ids),
                    OrphanedItem.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )


def serialize_vendor_linked_risks(
    vendors: list[Vendor],
    *,
    visible_risk_ids: set[int],
) -> dict[int, list[VendorLinkedRiskSummary]]:
    linked_risks_by_vendor_id: dict[int, list[VendorLinkedRiskSummary]] = {}

    for vendor in vendors:
        summaries: list[VendorLinkedRiskSummary] = []
        for link in getattr(vendor, "risk_links", []) or []:
            risk = getattr(link, "risk", None)
            if not risk or risk.id not in visible_risk_ids:
                continue
            summaries.append(
                VendorLinkedRiskSummary(
                    risk_id=risk.id,
                    risk_id_code=risk.risk_id_code,
                    risk_name=risk.name,
                )
            )
        linked_risks_by_vendor_id[vendor.id] = summaries

    return linked_risks_by_vendor_id


@dataclass(frozen=True)
class _VendorCollectionProjectionContext:
    pending_vendor_ids: set[int]
    governed_pending_vendor_ids: set[int]
    linked_risks_by_vendor_id: dict[int, list[VendorLinkedRiskSummary]]
    can_manage_asset_links: bool
    can_manage_process_links: bool


async def _load_vendor_collection_projection_context(
    db: AsyncSession,
    vendors: list[Vendor],
    *,
    current_user: User,
    can_read_risks: bool,
    visible_risk_ids_loader,
) -> _VendorCollectionProjectionContext:
    await _load_vendor_owner_metadata(db, vendors)
    pending_vendor_ids = await pending_vendor_owner_orphan_ids(
        db,
        vendor_ids=[vendor.id for vendor in vendors],
    )
    governed_pending_vendor_ids = await _active_governed_pending_vendor_ids(
        db,
        vendor_ids=[vendor.id for vendor in vendors],
    )
    visible_risk_ids = (
        await visible_risk_ids_loader(db, current_user=current_user, vendors=vendors) if can_read_risks else set()
    )
    linked_risks_by_vendor_id = serialize_vendor_linked_risks(vendors, visible_risk_ids=visible_risk_ids)
    can_manage_asset_links, can_manage_process_links = await _register_link_capabilities(db, current_user=current_user)
    return _VendorCollectionProjectionContext(
        pending_vendor_ids=pending_vendor_ids,
        governed_pending_vendor_ids=governed_pending_vendor_ids,
        linked_risks_by_vendor_id=linked_risks_by_vendor_id,
        can_manage_asset_links=can_manage_asset_links,
        can_manage_process_links=can_manage_process_links,
    )


async def serialize_vendor_reads(
    db: AsyncSession,
    vendors: list[Vendor],
    *,
    current_user: User,
    can_read_risks: bool,
    visible_risk_ids_loader=get_visible_vendor_risk_ids,
) -> list[VendorRead]:
    context = await _load_vendor_collection_projection_context(
        db,
        vendors,
        current_user=current_user,
        can_read_risks=can_read_risks,
        visible_risk_ids_loader=visible_risk_ids_loader,
    )
    return [
        vendor_to_read(
            vendor,
            current_user=current_user,
            linked_risks=context.linked_risks_by_vendor_id.get(vendor.id, []),
            can_manage_asset_links=context.can_manage_asset_links,
            can_manage_process_links=context.can_manage_process_links,
            ownership_pending=vendor.id in context.pending_vendor_ids,
            has_pending_change=vendor.id in context.governed_pending_vendor_ids,
        )
        for vendor in vendors
    ]


async def serialize_vendor_list_items(
    db: AsyncSession,
    vendors: list[Vendor],
    *,
    current_user: User,
    can_read_risks: bool,
    total: int,
    offset: int,
    limit: int,
    capabilities: dict[str, bool] | None,
    visible_risk_ids_loader=get_visible_vendor_risk_ids,
) -> VendorListResponse:
    context = await _load_vendor_collection_projection_context(
        db,
        vendors,
        current_user=current_user,
        can_read_risks=can_read_risks,
        visible_risk_ids_loader=visible_risk_ids_loader,
    )
    return vendor_list_response(
        vendors=vendors,
        total=total,
        offset=offset,
        limit=limit,
        current_user=current_user,
        linked_risks_by_vendor_id=context.linked_risks_by_vendor_id,
        capabilities=capabilities,
        can_manage_asset_links=context.can_manage_asset_links,
        can_manage_process_links=context.can_manage_process_links,
        pending_vendor_ids=context.pending_vendor_ids,
        governed_pending_vendor_ids=context.governed_pending_vendor_ids,
    )


async def _active_governed_pending_vendor_ids(
    db: AsyncSession,
    *,
    vendor_ids: list[int],
) -> set[int]:
    if not vendor_ids:
        return set()
    proposals = (
        (
            await db.execute(
                select(GovernedMutationProposal)
                .join(GovernedMutationProposal.approval_request)
                .join(GovernedMutationProposal.impact_locks)
                .options(
                    selectinload(GovernedMutationProposal.approval_request),
                    selectinload(GovernedMutationProposal.impact_locks),
                )
                .where(
                    GovernedMutationImpactLock.resource_type == "vendor",
                    GovernedMutationImpactLock.resource_id.in_(vendor_ids),
                    GovernedMutationImpactLock.released_at.is_(None),
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                )
            )
        )
        .scalars()
        .unique()
        .all()
    )
    from app.services._governed_mutations.notification_identity import (
        InvalidGovernedProcessNotificationIdentity,
        strict_governed_process_notification_identity,
    )

    visible_vendor_ids = set(vendor_ids)
    return {
        lock.resource_id
        for proposal in proposals
        if _has_strict_governed_identity(
            proposal,
            strict_identity=strict_governed_process_notification_identity,
            invalid_identity=InvalidGovernedProcessNotificationIdentity,
        )
        for lock in proposal.impact_locks
        if lock.resource_type == "vendor" and lock.resource_id in visible_vendor_ids
    }


def _has_strict_governed_identity(
    proposal: GovernedMutationProposal,
    *,
    strict_identity,
    invalid_identity: type[ValueError],
) -> bool:
    try:
        return strict_identity(proposal) is not None
    except invalid_identity:
        return False


async def compute_vendor_register_derivation(db: AsyncSession, vendors: list[Vendor]) -> IctRegisterDerivation:
    """Run the ICT Register engine with these Vendors as the graph targets.

    One parameter-set load and one closure load per call (compute-on-read,
    parent spec #38); the Contract and Sub-outsourcing projections consume the
    same derivation, so a Vendor's whole governed surface shares one compute.
    """
    parameters = await load_ict_workbook_parameter_set(db)
    graph = await load_ict_register_graph(db, vendors=vendors)
    return derive_ict_register(graph, parameters)


async def load_vendor_derived_blocks(db: AsyncSession, vendors: list[Vendor]) -> dict[int, VendorDerived]:
    """Compute the engine-derived block for each Vendor (compute-on-read, #49)."""
    if not vendors:
        return {}
    derivation = await compute_vendor_register_derivation(db, vendors)
    return {
        vendor.id: VendorDerived.model_validate(canonicalize_vendor_derived(derivation.vendors[vendor.id]))
        for vendor in vendors
    }


def serialize_vendor_detail(
    vendor: Vendor,
    *,
    current_user: User,
    derived: VendorDerived | None = None,
    can_manage_asset_links: bool = False,
    can_manage_process_links: bool = False,
    ownership_pending: bool = False,
) -> VendorRead:
    read = vendor_to_read(
        vendor,
        current_user=current_user,
        can_manage_asset_links=can_manage_asset_links,
        can_manage_process_links=can_manage_process_links,
        ownership_pending=ownership_pending,
    )
    if derived is None:
        return read
    return read.model_copy(update={"derived": derived})


async def serialize_vendor_detail_with_derived(db: AsyncSession, vendor: Vendor, *, current_user: User) -> VendorRead:
    await _load_vendor_owner_metadata(db, [vendor])
    ownership_pending = vendor.id in await pending_vendor_owner_orphan_ids(
        db,
        vendor_ids=[vendor.id],
    )
    can_view_full_derivation = bool(
        get_user_department_ids(current_user) is None
        and check_permission(current_user, "vendors", "read")
        and check_permission(current_user, "processes", "read")
        and check_permission(current_user, "assets", "read")
        and check_permission(current_user, "vendor_contracts", "read")
    )
    blocks = await load_vendor_derived_blocks(db, [vendor])
    pending_change = await load_pending_vendor_change(
        db,
        vendor_id=vendor.id,
        current_user=current_user,
    )
    from app.services._governed_mutations.fixed_vendor_policy import (
        load_fixed_vendor_scenario,
    )

    scenario = await load_fixed_vendor_scenario(db)
    protected_change_requires_approval = bool(
        scenario is not None
        and scenario.requires_approval
        and blocks[vendor.id].tier in {"critical", "significant"}
    )
    can_manage_asset_links, can_manage_process_links = await _register_link_capabilities(db, current_user=current_user)
    read = serialize_vendor_detail(
        vendor,
        current_user=current_user,
        derived=blocks.get(vendor.id) if can_view_full_derivation else None,
        can_manage_asset_links=can_manage_asset_links,
        can_manage_process_links=can_manage_process_links,
        ownership_pending=ownership_pending,
    )
    capabilities = read.capabilities
    if capabilities is not None:
        has_pending_change = pending_change is not None
        if has_pending_change:
            capabilities = _block_vendor_business_capabilities(capabilities)
        capabilities = capabilities.model_copy(
            update={
                "protected_change_requires_approval": protected_change_requires_approval,
                "can_request_change": bool(
                    protected_change_requires_approval
                    and capabilities.can_update
                    and not has_pending_change
                ),
                "can_cancel_pending_change": bool(
                    pending_change is not None
                    and pending_change.capabilities.can_cancel
                ),
                "has_pending_change": has_pending_change,
                "business_edit_blocked": has_pending_change,
            }
        )
    return read.model_copy(
        update={
            "capabilities": capabilities,
            "pending_change": pending_change,
        }
    )


def _actor_safe_vendor_snapshot(value: object) -> object:
    if isinstance(value, dict):
        return {
            str(key): _actor_safe_vendor_snapshot(item)
            for key, item in value.items()
            if isinstance(key, str) and key != "id" and not key.endswith("_id")
        }
    if isinstance(value, list):
        return [_actor_safe_vendor_snapshot(item) for item in value]
    return value


async def load_pending_vendor_change(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> VendorPendingChange | None:
    proposal = (
        await db.execute(
            select(GovernedMutationProposal)
            .options(
                selectinload(GovernedMutationProposal.approval_request),
                selectinload(GovernedMutationProposal.requested_by),
            )
            .join(GovernedMutationImpactLock)
            .join(GovernedMutationProposal.approval_request)
            .where(
                GovernedMutationImpactLock.resource_type == "vendor",
                GovernedMutationImpactLock.resource_id == vendor_id,
                GovernedMutationImpactLock.released_at.is_(None),
                ApprovalRequest.status == ApprovalStatus.PENDING,
            )
        )
    ).scalars().first()
    if proposal is None:
        return None
    from app.services._governed_mutations.fixed_vendor_policy import (
        is_live_eligible_vendor_resolver,
    )
    from app.services._governed_mutations.notification_identity import (
        InvalidGovernedProcessNotificationIdentity,
        strict_governed_process_notification_identity,
    )

    if not _has_strict_governed_identity(
        proposal,
        strict_identity=strict_governed_process_notification_identity,
        invalid_identity=InvalidGovernedProcessNotificationIdentity,
    ):
        return None
    approval = proposal.approval_request
    if proposal.primary_resource_type != "vendor":
        return VendorPendingChange(
            approval_id=None,
            proposal_id=None,
            proposal_version=None,
            requested_at=approval.created_at,
            requested_by_name=None,
            reason="",
            mutation_kind=None,
            before={},
            after={},
            derived_impact={},
            impacted_resources=[],
            relationship_change=None,
            capabilities={
                "can_view_diff": False,
                "can_cancel": False,
            },
        )
    scenario = await db.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == proposal.scenario_snapshot.get("key")
        )
    )
    can_view_diff = bool(
        proposal.requested_by_id == current_user.id
        or is_live_eligible_vendor_resolver(current_user, proposal, scenario)
    )
    safe_before = _actor_safe_vendor_snapshot(proposal.before_snapshot)
    safe_after = _actor_safe_vendor_snapshot(proposal.after_snapshot)
    safe_impact = _actor_safe_vendor_snapshot(proposal.derived_impact_snapshot)
    relationship_change = None
    if can_view_diff and proposal.mutation_kind.startswith("vendor.link."):
        _, _, resource, action = proposal.mutation_kind.split(".")
        relationship_change = {
            "target_resource_type": resource,
            "target_resource_name": f"Restricted {resource.title()}",
            "action": action,
            "before": {"linked": action == "remove"},
            "after": {"linked": action == "add"},
        }
    impacted_resources = [
        {
            "resource_type": str(item.get("resource_type") or "vendor"),
            "resource_name": str(item.get("resource_name") or "Restricted Vendor"),
        }
        for item in proposal.impacted_resources_snapshot
        if can_view_diff and isinstance(item, dict)
    ]
    return VendorPendingChange(
        approval_id=approval.id if can_view_diff else None,
        proposal_id=proposal.proposal_id if can_view_diff else None,
        proposal_version=proposal.proposal_version if can_view_diff else None,
        requested_at=approval.created_at,
        requested_by_name=(
            proposal.requested_by.name
            if can_view_diff and proposal.requested_by is not None
            else None
        ),
        reason=approval.reason if can_view_diff else "",
        mutation_kind=proposal.mutation_kind if can_view_diff else None,
        before=safe_before if can_view_diff and isinstance(safe_before, dict) else {},
        after=safe_after if can_view_diff and isinstance(safe_after, dict) else {},
        derived_impact=(
            safe_impact if can_view_diff and isinstance(safe_impact, dict) else {}
        ),
        impacted_resources=impacted_resources,
        relationship_change=relationship_change,
        capabilities={
            "can_view_diff": can_view_diff,
            "can_cancel": proposal.requested_by_id == current_user.id,
        },
    )


async def _register_link_capabilities(
    db: AsyncSession,
    *,
    current_user: User,
) -> tuple[bool, bool]:
    return (
        await has_editable_asset_record(db, current_user=current_user),
        await has_editable_process_record(db, current_user=current_user),
    )
