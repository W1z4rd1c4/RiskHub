from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.vendor import vendor_list_response, vendor_to_read
from app.core.permissions import get_user_department_ids, visible_risk_ids
from app.core.security import check_permission
from app.models import OrphanedItem, User, Vendor, VendorRiskLink
from app.schemas.vendor import VendorDerived, VendorLinkedRiskSummary, VendorListResponse, VendorRead
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
    visible_risk_ids = (
        await visible_risk_ids_loader(db, current_user=current_user, vendors=vendors) if can_read_risks else set()
    )
    linked_risks_by_vendor_id = serialize_vendor_linked_risks(vendors, visible_risk_ids=visible_risk_ids)
    can_manage_asset_links, can_manage_process_links = await _register_link_capabilities(db, current_user=current_user)
    return _VendorCollectionProjectionContext(
        pending_vendor_ids=pending_vendor_ids,
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
    )


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
    blocks = await load_vendor_derived_blocks(db, [vendor]) if can_view_full_derivation else {}
    can_manage_asset_links, can_manage_process_links = await _register_link_capabilities(db, current_user=current_user)
    return serialize_vendor_detail(
        vendor,
        current_user=current_user,
        derived=blocks.get(vendor.id),
        can_manage_asset_links=can_manage_asset_links,
        can_manage_process_links=can_manage_process_links,
        ownership_pending=ownership_pending,
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
