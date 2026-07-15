"""Whole-register derivation orchestration for the ICT register."""

from __future__ import annotations

from collections import Counter
from dataclasses import replace

from app.services._ict_register_reference.parameters import IctWorkbookParameterSet

from ._derivation_impl import (
    ANO,
    NE,
    UNKNOWN_LOOKUP,
    AssetAssetLinkInput,
    AssetDerivation,
    AssetVendorLinkInput,
    IctRegisterDerivation,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivation,
    ProcessVendorLinkInput,
    SubOutsourcingDerivation,
    SubOutsourcingInput,
    TransitiveProcessVendorLink,
    VendorContractDerivation,
    VendorContractInput,
    VendorDerivation,
    _effective_parameters,
    process_display_name,
)
from .derivation_asset import _derive_asset
from .derivation_contracts import _derive_contract
from .derivation_process import _derive_process
from .derivation_vendor import (
    _derive_sub_outsourcing,
    _derive_vendor,
    _resolve_sub_outsourcing_ranks,
    _vendor_cif,
)

# Entry point.
# ---------------------------------------------------------------------------


def derive_ict_register(graph: IctRegisterGraph, parameters: IctWorkbookParameterSet) -> IctRegisterDerivation:
    """Derive every in-scope value for every row of the graph, workbook-verbatim.

    Order follows the cascade's data flow: Processes (row-local) -> Assets ->
    the derived §2 transitive expansion -> per-Vendor CIF -> the Contracts'
    hidden CIF -> Sub-outsourcing ranks -> full Vendor and Contract blocks.
    Counts and aggregates are relative to the links present in the graph — the
    loader in ``derivation_inputs`` guarantees a complete link closure for the
    rows a caller consumes.
    """
    params = _effective_parameters(parameters)

    process_id_counts: dict[int, int] = {}
    for row in graph.processes:
        process_id_counts[row.id] = process_id_counts.get(row.id, 0) + 1

    process_link_counts: dict[int, int] = {}
    for link in graph.process_asset_links:
        process_link_counts[link.process_id] = process_link_counts.get(link.process_id, 0) + 1

    process_vendor_counts: dict[int, int] = {}
    for vendor_link in graph.process_vendor_links:
        process_vendor_counts[vendor_link.process_id] = process_vendor_counts.get(vendor_link.process_id, 0) + 1

    asset_links: dict[int, list[ProcessAssetLinkInput]] = {}
    for link in graph.process_asset_links:
        asset_links.setdefault(link.asset_id, []).append(link)

    # The raw §2 join (spec 1.8): for every sheet-10 link, one row per
    # sheet-05 link of that Asset, in VAD-major then VPA order — never
    # deduplicated (the workbook's pairs_total counts occurrences).
    raw_transitive_pairs: list[tuple[AssetVendorLinkInput, ProcessAssetLinkInput]] = [
        (av_link, pal_link)
        for av_link in graph.asset_vendor_links
        for pal_link in asset_links.get(av_link.asset_id, ())
    ]
    transitive_counts_by_process: dict[int, int] = {}
    for _, pal_link in raw_transitive_pairs:
        transitive_counts_by_process[pal_link.process_id] = (
            transitive_counts_by_process.get(pal_link.process_id, 0) + 1
        )

    processes: dict[int, ProcessDerivation] = {}
    for row in graph.processes:
        processes[row.id] = _derive_process(
            row,
            params,
            linked_asset_count=process_link_counts.get(row.id, 0),
            manual_vendor_link_count=process_vendor_counts.get(row.id, 0),
            transitive_vendor_pair_count=transitive_counts_by_process.get(row.id, 0),
            is_duplicate=process_id_counts[row.id] > 1,
        )

    processes_by_id = {row.id: row for row in graph.processes}
    asset_names_by_id = {asset.id: asset.name for asset in graph.assets}

    # vazby_aktiv reads sheet-06 links from the DEPENDENT side only (the
    # builder's TEXTJOIN matches 06!B, the dependent asset id).
    asset_asset_links: dict[int, list[AssetAssetLinkInput]] = {}
    for aa_link in graph.asset_asset_links:
        asset_asset_links.setdefault(aa_link.dependent_asset_id, []).append(aa_link)

    asset_vendor_links: dict[int, list[AssetVendorLinkInput]] = {}
    for av_link in graph.asset_vendor_links:
        asset_vendor_links.setdefault(av_link.asset_id, []).append(av_link)

    assets: dict[int, AssetDerivation] = {}
    for asset in graph.assets:
        assets[asset.id] = _derive_asset(
            asset,
            params,
            links=tuple(asset_links.get(asset.id, ())),
            processes_by_id=processes_by_id,
            process_results=processes,
            asset_names_by_id=asset_names_by_id,
            asset_asset_links=tuple(asset_asset_links.get(asset.id, ())),
            vendor_links=tuple(asset_vendor_links.get(asset.id, ())),
        )

    # --- The derived §2 records (11 §2 columns), from the row-local results.
    vendor_names_by_id = {vendor.id: vendor.name for vendor in graph.vendors}
    transitive_records: list[TransitiveProcessVendorLink] = []
    for av_link, pal_link in raw_transitive_pairs:
        process_row = processes_by_id.get(pal_link.process_id)
        process_result = processes.get(pal_link.process_id)
        transitive_records.append(
            TransitiveProcessVendorLink(
                process_id=pal_link.process_id,
                process_name=(
                    process_display_name(process_row.l1_process, process_row.l2_subprocess)
                    if process_row is not None
                    else UNKNOWN_LOOKUP
                ),
                process_cif=process_result.cif if process_result is not None else None,
                process_criticality=(
                    process_result.criticality_class if process_result is not None else None
                ),
                vendor_id=av_link.vendor_id,
                vendor_name=(
                    av_link.vendor_name
                    or vendor_names_by_id.get(av_link.vendor_id, UNKNOWN_LOOKUP)
                ),
                via_asset_id=av_link.asset_id,
                via_asset_name=asset_names_by_id.get(av_link.asset_id, UNKNOWN_LOOKUP),
            )
        )
    for process_id, result in processes.items():
        records = tuple(r for r in transitive_records if r.process_id == process_id)
        if records:
            processes[process_id] = replace(result, transitive_vendor_links=records)

    # --- Vendor-side maps.
    vendor_asset_link_map: dict[int, list[AssetVendorLinkInput]] = {}
    for av_link in graph.asset_vendor_links:
        vendor_asset_link_map.setdefault(av_link.vendor_id, []).append(av_link)
    vendor_process_link_map: dict[int, list[ProcessVendorLinkInput]] = {}
    for pv_link in graph.process_vendor_links:
        vendor_process_link_map.setdefault(pv_link.vendor_id, []).append(pv_link)
    vendor_contract_map: dict[int, list[VendorContractInput]] = {}
    for contract in graph.contracts:
        vendor_contract_map.setdefault(contract.vendor_id, []).append(contract)
    contracts_by_id = {contract.id: contract for contract in graph.contracts}
    contract_vendor_ids = {contract.id: contract.vendor_id for contract in graph.contracts}
    contract_sub_map: dict[int, list[SubOutsourcingInput]] = {}
    for sub in graph.sub_outsourcing:
        contract_sub_map.setdefault(sub.contract_id, []).append(sub)

    # Per-vendor CIF first: 08!W (the contracts' hidden CIF column) reads the
    # prime vendor's cif, and the chain rows read 08!W — never the tier.
    vendor_cif_results: dict[int, tuple[str, int, int]] = {
        vendor.id: _vendor_cif(
            vendor_asset_links=tuple(vendor_asset_link_map.get(vendor.id, ())),
            vendor_process_links=tuple(vendor_process_link_map.get(vendor.id, ())),
            asset_results=assets,
            process_results=processes,
        )
        for vendor in graph.vendors
    }
    contract_cif: dict[int, str] = {
        contract.id: vendor_cif_results.get(contract.vendor_id, (NE, 0, 0))[0]
        for contract in graph.contracts
    }

    # --- Sub-outsourcing rows: ranks, then the derived columns.
    sub_ranks = _resolve_sub_outsourcing_ranks(graph.sub_outsourcing)
    duplicate_key_counts = Counter(
        (sub.contract_id, sub.sub_provider_name)
        for sub in graph.sub_outsourcing
        if sub.sub_provider_name is not None
    )
    sub_outsourcing: dict[int, SubOutsourcingDerivation] = {
        sub.id: _derive_sub_outsourcing(
            sub,
            contracts_by_id=contracts_by_id,
            contract_cif=contract_cif,
            vendor_names_by_id=vendor_names_by_id,
            ranks=sub_ranks,
            duplicate_key_counts=duplicate_key_counts,
        )
        for sub in graph.sub_outsourcing
    }

    # --- Full Vendor blocks.
    vendors: dict[int, VendorDerivation] = {}
    for vendor in graph.vendors:
        cif, cif_asset_hits, cif_process_hits = vendor_cif_results[vendor.id]
        manual_links = tuple(vendor_process_link_map.get(vendor.id, ()))
        manual_cif_hits = sum(
            1
            for link in manual_links
            if link.process_id in processes and processes[link.process_id].cif == ANO
        )
        vendors[vendor.id] = _derive_vendor(
            vendor,
            cif=cif,
            cif_asset_link_count=cif_asset_hits,
            cif_process_link_count=cif_process_hits,
            vendor_asset_links=tuple(vendor_asset_link_map.get(vendor.id, ())),
            manual_process_link_count=len(manual_links),
            manual_cif_process_link_count=manual_cif_hits,
            transitive_links=tuple(
                record for record in transitive_records if record.vendor_id == vendor.id
            ),
            asset_results=assets,
            contracts=tuple(vendor_contract_map.get(vendor.id, ())),
            contract_cif=contract_cif,
            sub_rows=graph.sub_outsourcing,
            sub_ranks=sub_ranks,
            contract_vendor_ids=contract_vendor_ids,
        )

    # --- Contract blocks (need the chain ranks for the S display).
    reference_counts = Counter(
        contract.contract_reference
        for contract in graph.contracts
        if contract.contract_reference is not None
    )
    contracts: dict[int, VendorContractDerivation] = {
        contract.id: _derive_contract(
            contract,
            vendor_names_by_id=vendor_names_by_id,
            prime_vendor_cif=contract_cif[contract.id],
            reference_counts=reference_counts,
            contract_sub_rows=tuple(contract_sub_map.get(contract.id, ())),
            sub_ranks=sub_ranks,
        )
        for contract in graph.contracts
    }

    return IctRegisterDerivation(
        processes=processes,
        assets=assets,
        vendors=vendors,
        contracts=contracts,
        sub_outsourcing=sub_outsourcing,
    )
