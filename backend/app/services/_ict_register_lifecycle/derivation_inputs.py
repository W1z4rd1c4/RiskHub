"""Register-graph loader for the derivation engine (issues #48/#49).

Loads the persistence rows behind a page of Processes, Assets, and/or Vendors
into the plain :class:`~.derivation.IctRegisterGraph` the pure engine
consumes. The loaded graph is a **link closure for the target rows**: every
Link relation touching a target row is loaded, plus the counterpart rows those
links reference — and, down the vendor side of the cascade, the rows THOSE
rows need (a target Vendor pulls its Asset links, those Assets, their Process
links, and those Processes, so the MAXIFS over asset criticality and the
two-path CIF are computed over correct asset/process derivations). Non-target
rows exist in the graph only as lookup material — their own derivations are
not authoritative (their remaining links are not loaded) and callers must
never surface them.

Archived rows keep feeding the graph: Link relations survive archiving (they
are only removed explicitly), and the link sections of the register UI show
them either way — the derivation stays consistent with the visible graph.

Vendor targets additionally load the WHOLE Contract and Sub-outsourcing
registers (issue #49): the workbook's duplicate-reference check (08!U) and
subcontractor scans (09!F) are register-wide COUNTIFs, and register scale is
hundreds of rows by design (parent spec #38: compute-on-read). Contract and
Sub-outsourcing serialization passes the OWNING Vendor as the target.

The workbook's 09!F "Subdodavatel (ID)" is a Vendor-register reference; the
app stores sub-provider identity inline (#45), so this loader never resolves
``SubOutsourcingInput.sub_provider_vendor_id`` — the engine's verbatim chain
paths stay golden-covered via direct input (see the engine module docstring).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from sqlalchemy import or_, select

from app.models import (
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Vendor,
    VendorContract,
    VendorSubOutsourcing,
)

from .derivation import (
    AssetAssetLinkInput,
    AssetDerivationInput,
    AssetVendorLinkInput,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivationInput,
    ProcessVendorLinkInput,
    SubOutsourcingInput,
    VendorContractInput,
    VendorDerivationInput,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def process_derivation_input(process: Process) -> ProcessDerivationInput:
    """Map a Process row to the engine's plain input (entered fields only)."""
    return ProcessDerivationInput(
        id=process.id,
        l1_process=process.l1_process,
        l2_subprocess=process.l2_subprocess,
        owner=process.owner,
        impact_client=process.impact_client,
        impact_market_operations=process.impact_market_operations,
        impact_regulatory=process.impact_regulatory,
        impact_financial=process.impact_financial,
        mtpd_hours=process.mtpd_hours,
        preliminary_criticality=process.preliminary_criticality,
        cif_override=process.cif_override,
        rto_hours=process.rto_hours,
        rpo_hours=process.rpo_hours,
        bcm_link=process.bcm_link,
        interruption_impact=process.interruption_impact,
        assessment_date=process.assessment_date,
    )


def asset_derivation_input(asset: Asset) -> AssetDerivationInput:
    """Map an Asset row to the engine's plain input (entered fields only)."""
    return AssetDerivationInput(
        id=asset.id,
        name=asset.name,
        confidentiality_rating=asset.confidentiality_rating,
        integrity_rating=asset.integrity_rating,
        availability_rating=asset.availability_rating,
        authenticity_rating=asset.authenticity_rating,
        impact_client=asset.impact_client,
        impact_regulatory=asset.impact_regulatory,
        substitutability_rating=asset.substitutability_rating,
        vendor_dependency_rating=asset.vendor_dependency_rating,
        preliminary_criticality=asset.preliminary_criticality,
        lifecycle_state=asset.lifecycle_state,
        standard_support_end_date=asset.standard_support_end_date,
        asset_type=asset.asset_type,
        asset_level=asset.asset_level,
        description=asset.description,
        physical_location=asset.physical_location,
        deployment_model=asset.deployment_model,
        business_owner=asset.business_owner,
        ict_owner=asset.ict_owner,
        gdpr_relevance=asset.gdpr_relevance,
        ai_relevance=asset.ai_relevance,
        data_classification=asset.data_classification,
        internet_exposed=asset.internet_exposed,
    )


def vendor_derivation_input(vendor: Vendor) -> VendorDerivationInput:
    """Map a Vendor row to the engine's plain input (entered fields only).

    ``replaceability`` is the register's Substituce input (issue #44).
    """
    return VendorDerivationInput(
        id=vendor.id,
        name=vendor.name,
        country=vendor.country,
        person_type=vendor.person_type,
        identifier_type=vendor.identifier_type,
        identifier_value=vendor.identifier_value,
        substitutability=vendor.replaceability,
        exit_plan_state=vendor.exit_plan_state,
        ex_ante_assessment_date=vendor.ex_ante_assessment_date,
        significance_authorization_conditions=vendor.significance_authorization_conditions,
        significance_regulatory_requirements=vendor.significance_regulatory_requirements,
        significance_service_quality=vendor.significance_service_quality,
        significance_financial_impact=vendor.significance_financial_impact,
        significance_reputation_continuity=vendor.significance_reputation_continuity,
        significance_cumulative_impact=vendor.significance_cumulative_impact,
    )


def contract_derivation_input(contract: VendorContract) -> VendorContractInput:
    """Map a Contract row to the engine's plain input (entered columns only)."""
    return VendorContractInput(
        id=contract.id,
        vendor_id=contract.vendor_id,
        contract_reference=contract.contract_reference,
        arrangement_type=contract.arrangement_type,
        main_contract=contract.main_contract,
        roi_scope=contract.roi_scope,
        start_date=contract.start_date,
        end_date=contract.end_date,
    )


def sub_outsourcing_derivation_input(entry: VendorSubOutsourcing) -> SubOutsourcingInput:
    """Map a Sub-outsourcing row to the engine's plain input."""
    return SubOutsourcingInput(
        id=entry.id,
        vendor_id=entry.vendor_id,
        contract_id=entry.contract_id,
        predecessor_id=entry.predecessor_id,
        sub_provider_name=entry.sub_provider_name,
        # Inline sub-provider identity (#45): never a Vendor-register reference.
        sub_provider_vendor_id=None,
    )


async def load_ict_register_graph(
    db: "AsyncSession",
    *,
    processes: Sequence[Process] = (),
    assets: Sequence[Asset] = (),
    vendors: Sequence[Vendor] = (),
) -> IctRegisterGraph:
    """Load the graph slice whose derivations are authoritative for the targets."""
    process_rows = list(processes)
    asset_rows = list(assets)
    vendor_rows = list(vendors)
    process_ids = {process.id for process in process_rows}
    asset_ids = {asset.id for asset in asset_rows}
    vendor_ids = {vendor.id for vendor in vendor_rows}

    # Sheet-10 links: for target assets, for target vendors, AND — because the
    # Process dod_n counts the derived §2 expansion (#49) — for every asset a
    # target process links to. The §2 join needs those assets' vendor links.
    process_linked_asset_ids: set[int] = set()
    if process_ids:
        pal_asset_rows = await db.execute(
            select(ProcessAssetLink.asset_id).where(ProcessAssetLink.process_id.in_(process_ids))
        )
        process_linked_asset_ids = set(pal_asset_rows.scalars())

    asset_vendor_links: list[AssetVendorLink] = []
    vad_conditions = []
    vad_asset_ids = asset_ids | process_linked_asset_ids
    if vad_asset_ids:
        vad_conditions.append(AssetVendorLink.asset_id.in_(vad_asset_ids))
    if vendor_ids:
        vad_conditions.append(AssetVendorLink.vendor_id.in_(vendor_ids))
    if vad_conditions:
        asset_vendor_links = list(
            (
                await db.execute(
                    select(AssetVendorLink).where(or_(*vad_conditions)).order_by(AssetVendorLink.id)
                )
            ).scalars()
        )

    # Row closure: Assets reached through the vendor links (their vysledna
    # feeds the vendor MAXIFS, their names the §2 display) — plus, further
    # down, their own Process links so their CIF/cascade compute correctly.
    reachable_asset_ids = asset_ids | process_linked_asset_ids | {
        link.asset_id for link in asset_vendor_links
    }
    missing_reachable_assets = reachable_asset_ids - asset_ids
    if missing_reachable_assets:
        asset_rows.extend(
            (await db.execute(select(Asset).where(Asset.id.in_(missing_reachable_assets)))).scalars()
        )

    # Sheet-05 links touching any target row or any reachable asset, in
    # stable link order.
    links: list[ProcessAssetLink] = []
    conditions = []
    if process_ids:
        conditions.append(ProcessAssetLink.process_id.in_(process_ids))
    if reachable_asset_ids:
        conditions.append(ProcessAssetLink.asset_id.in_(reachable_asset_ids))
    if conditions:
        links = list(
            (
                await db.execute(
                    select(ProcessAssetLink).where(or_(*conditions)).order_by(ProcessAssetLink.id)
                )
            ).scalars()
        )

    # Sheet-11 §1 manual pairs for the target processes (dod_n counts them)
    # and the target vendors (the second CIF path + proc_n).
    process_vendor_links: list[ProcessVendorLink] = []
    pv_conditions = []
    if process_ids:
        pv_conditions.append(ProcessVendorLink.process_id.in_(process_ids))
    if vendor_ids:
        pv_conditions.append(ProcessVendorLink.vendor_id.in_(vendor_ids))
    if pv_conditions:
        process_vendor_links = list(
            (
                await db.execute(
                    select(ProcessVendorLink).where(or_(*pv_conditions)).order_by(ProcessVendorLink.id)
                )
            ).scalars()
        )

    # Row closure: Processes the loaded links reference (cascade lookups and
    # the §1/§2 CIF flags).
    referenced_process_ids = {link.process_id for link in links} | {
        link.process_id for link in process_vendor_links
    }
    missing_process_ids = referenced_process_ids - process_ids
    if missing_process_ids:
        process_rows.extend(
            (await db.execute(select(Process).where(Process.id.in_(missing_process_ids)))).scalars()
        )

    # Sheet-06 links where a loaded asset is the DEPENDENT end — the workbook's
    # vazby_aktiv TEXTJOIN matches 06!B (the dependent id) only — plus the
    # supporting Assets those links reference (name lookups).
    asset_asset_links: list[AssetAssetLink] = []
    if reachable_asset_ids:
        asset_asset_links = list(
            (
                await db.execute(
                    select(AssetAssetLink)
                    .where(AssetAssetLink.dependent_asset_id.in_(reachable_asset_ids))
                    .order_by(AssetAssetLink.id)
                )
            ).scalars()
        )
    loaded_asset_ids = {asset.id for asset in asset_rows}
    missing_supporting_ids = {
        link.supporting_asset_id for link in asset_asset_links
    } - loaded_asset_ids
    if missing_supporting_ids:
        asset_rows.extend(
            (await db.execute(select(Asset).where(Asset.id.in_(missing_supporting_ids)))).scalars()
        )

    # Vendor name lookups for the loaded sheet-10 links (dod_seznam and the
    # §2 vendor-name column) — resolved here, the engine stays pure.
    vendor_names_by_id: dict[int, str] = {vendor.id: vendor.name for vendor in vendor_rows}
    linked_vendor_ids = {link.vendor_id for link in asset_vendor_links} - set(vendor_names_by_id)
    if linked_vendor_ids:
        vendor_name_rows = await db.execute(
            select(Vendor.id, Vendor.name).where(Vendor.id.in_(linked_vendor_ids))
        )
        vendor_names_by_id.update(
            {vendor_id: name for vendor_id, name in vendor_name_rows.all()}
        )

    # Contracts + Sub-outsourcing (vendor targets only): whole-register loads —
    # the duplicate check (08!U) and the chain scans (09!E/F) are global.
    contracts: list[VendorContract] = []
    sub_outsourcing: list[VendorSubOutsourcing] = []
    if vendor_ids:
        contracts = list(
            (await db.execute(select(VendorContract).order_by(VendorContract.id))).scalars()
        )
        sub_outsourcing = list(
            (
                await db.execute(select(VendorSubOutsourcing).order_by(VendorSubOutsourcing.id))
            ).scalars()
        )

    return IctRegisterGraph(
        processes=tuple(process_derivation_input(process) for process in process_rows),
        assets=tuple(asset_derivation_input(asset) for asset in asset_rows),
        process_asset_links=tuple(
            ProcessAssetLinkInput(
                process_id=link.process_id,
                asset_id=link.asset_id,
                spof=link.spof,
                is_primary=link.is_primary,
            )
            for link in links
        ),
        asset_asset_links=tuple(
            AssetAssetLinkInput(
                dependent_asset_id=link.dependent_asset_id,
                supporting_asset_id=link.supporting_asset_id,
            )
            for link in asset_asset_links
        ),
        asset_vendor_links=tuple(
            AssetVendorLinkInput(
                asset_id=link.asset_id,
                vendor_id=link.vendor_id,
                vendor_name=vendor_names_by_id.get(link.vendor_id),
                ict_service_code=link.ict_service_code,
                contract_reference=link.contract_reference,
            )
            for link in asset_vendor_links
        ),
        process_vendor_links=tuple(
            ProcessVendorLinkInput(process_id=link.process_id, vendor_id=link.vendor_id)
            for link in process_vendor_links
        ),
        vendors=tuple(vendor_derivation_input(vendor) for vendor in vendor_rows),
        contracts=tuple(contract_derivation_input(contract) for contract in contracts),
        sub_outsourcing=tuple(sub_outsourcing_derivation_input(entry) for entry in sub_outsourcing),
    )
