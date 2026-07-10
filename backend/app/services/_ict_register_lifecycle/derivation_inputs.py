"""Register-graph loader for the derivation engine (issue #48).

Loads the persistence rows behind a page of Processes and/or Assets into the
plain :class:`~.derivation.IctRegisterGraph` the pure engine consumes. The
loaded graph is a **link closure for the target rows**: every Link relation
touching a target row is loaded, plus the counterpart rows those links
reference (linked Processes for the cascade lookups, linked Assets for the
name aggregates). Non-target rows exist in the graph only as lookup material —
their own derivations are not authoritative (their remaining links are not
loaded) and callers must never surface them.

Archived rows keep feeding the graph: Link relations survive archiving (they
are only removed explicitly), and the link sections of the register UI show
them either way — the derivation stays consistent with the visible graph.

The Asset<->Vendor (sheet 10) and manual Process<->Vendor (sheet 11 §1)
links are LIVE inputs (issue #46): loaded for the target rows only, with the
Vendor name lookup resolved here so the engine stays persistence-free.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from sqlalchemy import or_, select

from app.models import Asset, AssetAssetLink, AssetVendorLink, Process, ProcessAssetLink, ProcessVendorLink, Vendor

from .derivation import (
    AssetAssetLinkInput,
    AssetDerivationInput,
    AssetVendorLinkInput,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivationInput,
    ProcessVendorLinkInput,
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
    )


async def load_ict_register_graph(
    db: "AsyncSession",
    *,
    processes: Sequence[Process] = (),
    assets: Sequence[Asset] = (),
) -> IctRegisterGraph:
    """Load the graph slice whose derivations are authoritative for the targets."""
    process_rows = list(processes)
    asset_rows = list(assets)
    process_ids = {process.id for process in process_rows}
    asset_ids = {asset.id for asset in asset_rows}

    # Sheet-05 links touching any target row, in stable link order.
    links: list[ProcessAssetLink] = []
    conditions = []
    if process_ids:
        conditions.append(ProcessAssetLink.process_id.in_(process_ids))
    if asset_ids:
        conditions.append(ProcessAssetLink.asset_id.in_(asset_ids))
    if conditions:
        links = list(
            (
                await db.execute(
                    select(ProcessAssetLink).where(or_(*conditions)).order_by(ProcessAssetLink.id)
                )
            ).scalars()
        )

    # Row closure: Processes the target assets link to (for the cascade lookups).
    missing_process_ids = {link.process_id for link in links} - process_ids
    if missing_process_ids:
        process_rows.extend(
            (await db.execute(select(Process).where(Process.id.in_(missing_process_ids)))).scalars()
        )

    # Sheet-06 links where a target asset is the DEPENDENT end — the workbook's
    # vazby_aktiv TEXTJOIN matches 06!B (the dependent id) only — plus the
    # supporting Assets those links reference (name lookups).
    asset_asset_links: list[AssetAssetLink] = []
    if asset_ids:
        asset_asset_links = list(
            (
                await db.execute(
                    select(AssetAssetLink)
                    .where(AssetAssetLink.dependent_asset_id.in_(asset_ids))
                    .order_by(AssetAssetLink.id)
                )
            ).scalars()
        )
    missing_asset_ids = {link.supporting_asset_id for link in asset_asset_links} - asset_ids
    if missing_asset_ids:
        asset_rows.extend(
            (await db.execute(select(Asset).where(Asset.id.in_(missing_asset_ids)))).scalars()
        )

    # Sheet-10 links for the target assets (the vendor aggregates and
    # ext_zavis are per-asset rules), plus the Vendor name lookups the
    # dod_seznam TEXTJOIN needs — resolved here, the engine stays pure.
    asset_vendor_links: list[AssetVendorLink] = []
    if asset_ids:
        asset_vendor_links = list(
            (
                await db.execute(
                    select(AssetVendorLink)
                    .where(AssetVendorLink.asset_id.in_(asset_ids))
                    .order_by(AssetVendorLink.id)
                )
            ).scalars()
        )
    vendor_names_by_id: dict[int, str] = {}
    linked_vendor_ids = {link.vendor_id for link in asset_vendor_links}
    if linked_vendor_ids:
        vendor_name_rows = await db.execute(
            select(Vendor.id, Vendor.name).where(Vendor.id.in_(linked_vendor_ids))
        )
        vendor_names_by_id = {vendor_id: name for vendor_id, name in vendor_name_rows.all()}

    # Sheet-11 §1 manual pairs for the target processes (dod_n counts them).
    process_vendor_links: list[ProcessVendorLink] = []
    if process_ids:
        process_vendor_links = list(
            (
                await db.execute(
                    select(ProcessVendorLink)
                    .where(ProcessVendorLink.process_id.in_(process_ids))
                    .order_by(ProcessVendorLink.id)
                )
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
    )
