"""Vendor and sub-outsourcing derivation formulas for the ICT register."""

from __future__ import annotations

from collections.abc import Mapping

from app.services._ict_register_reference import CLOUD_SERVICE_S_CODES, COUNTRY_CATEGORIES

from ._derivation_impl import (
    _TIER_SUBSTITUTABILITY_TRIGGERS,
    _VENDOR_COMPLETENESS_ENTERED_FIELDS,
    _VENDOR_COMPLETENESS_MAIN_CONTRACT_FIELDS,
    ANO,
    CHAIN_BREAK_CHECK,
    CHAIN_LEVEL_DEEP_SUB,
    CHAIN_LEVEL_DIRECT_SUB,
    CHAIN_LEVEL_OWN_LINKS,
    CHECK_OK,
    CRITICALITY_CLASSES,
    DUPLICATE_CHECK,
    NE,
    TIER_CRITICAL,
    TIER_SIGNIFICANT,
    TIER_STANDARD,
    UNKNOWN_LOOKUP,
    AssetDerivation,
    AssetVendorLinkInput,
    ProcessDerivation,
    ProcessVendorLinkInput,
    SubOutsourcingDerivation,
    SubOutsourcingDerivedInputs,
    SubOutsourcingInput,
    TransitiveProcessVendorLink,
    VendorContractInput,
    VendorDerivation,
    VendorDerivationInput,
    VendorDerivedInputs,
    _criticality_rank,
)

# Vendor-side rules (#49): chain walk, Sub-outsourcing, Vendor, Contract.
# ---------------------------------------------------------------------------


def _resolve_sub_outsourcing_ranks(rows: tuple[SubOutsourcingInput, ...]) -> dict[int, int | None]:
    """09!I "Rank (odvozeno)" — builder sheets_vendors.py:362-365, verbatim:

        =IF(OR($B="",$F="",$E=""),"",IF($E=$D,2,
          IFERROR(INDEX($I,MATCH($B&"|"&$E,$M,0))+1,"?")))

    A linked-list walk, not an aggregation: a direct sub-outsourcer (the
    workbook's "parent = the contract's prime vendor", our predecessor None)
    is rank 2; a deeper row takes its predecessor's rank + 1. A missing or
    cross-contract predecessor breaks the chain (the MATCH finds no row under
    the same contract), a broken predecessor propagates ("?"+1 is an Excel
    error -> IFERROR -> "?"), and a cycle can never resolve — all three yield
    the None sentinel rendered as "?".
    """
    rows_by_id = {row.id: row for row in rows}
    ranks: dict[int, int | None] = {}

    def resolve(row: SubOutsourcingInput, trail: frozenset[int]) -> int | None:
        if row.id in ranks:
            return ranks[row.id]
        if row.predecessor_id is None:
            ranks[row.id] = 2
            return 2
        predecessor = rows_by_id.get(row.predecessor_id)
        if predecessor is None or predecessor.contract_id != row.contract_id or predecessor.id in trail:
            ranks[row.id] = None
            return None
        predecessor_rank = resolve(predecessor, trail | {row.id})
        ranks[row.id] = None if predecessor_rank is None else predecessor_rank + 1
        return ranks[row.id]

    for row in rows:
        resolve(row, frozenset({row.id}))
    return ranks


def _derive_sub_outsourcing(
    row: SubOutsourcingInput,
    *,
    contracts_by_id: Mapping[int, VendorContractInput],
    contract_cif: Mapping[int, str],
    vendor_names_by_id: Mapping[int, str],
    ranks: Mapping[int, int | None],
    duplicate_key_counts: Mapping[tuple[int, str], int],
) -> SubOutsourcingDerivation:
    contract = contracts_by_id.get(row.contract_id)

    # C — =IFERROR(XLOOKUP($B,SmlouvyID,SmlouvyRef,"?"),"?") (builder :354-355).
    contract_reference = contract.contract_reference if contract is not None else UNKNOWN_LOOKUP
    # D — the contract's own prime vendor (builder :356-358), name via 07!B.
    contract_vendor_id = contract.vendor_id if contract is not None else None
    contract_vendor_name = (
        vendor_names_by_id.get(contract.vendor_id, UNKNOWN_LOOKUP)
        if contract is not None
        else UNKNOWN_LOOKUP
    )

    rank = ranks[row.id]
    # J — =IFERROR(XLOOKUP($B, 08!A, 08!W, "Ne"),"Ne") (builder :366-368): the
    # contract's hidden CIF, identical for EVERY row of the chain (spec 2.3(3a)).
    critical_service = contract_cif.get(row.contract_id, NE)
    # O — =IFERROR(XLOOKUP($B, 08!A, 08!K, ""),"") (builder :375-377).
    roi_scope = contract.roi_scope if contract is not None else None

    # K — =IF(N($N)>1,"DUPLICITA",IF($I="?","CHYBA ŘETĚZCE","OK")) (builder
    # :369-370). The M key is contract|subcontractor; with inline sub-provider
    # identity (#45) the closest analog is the entered name; blank names never
    # participate (M="" when F="").
    duplicate_key_count = (
        duplicate_key_counts.get((row.contract_id, row.sub_provider_name), 0)
        if row.sub_provider_name is not None
        else 0
    )
    if duplicate_key_count > 1:
        chain_check = DUPLICATE_CHECK
    elif rank is None:
        chain_check = CHAIN_BREAK_CHECK
    else:
        chain_check = CHECK_OK

    predecessor_rank = ranks.get(row.predecessor_id) if row.predecessor_id is not None else None
    return SubOutsourcingDerivation(
        contract_reference=contract_reference,
        contract_vendor_id=contract_vendor_id,
        contract_vendor_name=contract_vendor_name,
        rank=rank,
        critical_service=critical_service,
        chain_check=chain_check,
        roi_scope=roi_scope,
        inputs=SubOutsourcingDerivedInputs(
            contract_id=row.contract_id,
            predecessor_id=row.predecessor_id,
            predecessor_rank=predecessor_rank,
            is_direct=row.predecessor_id is None,
            duplicate_key_count=duplicate_key_count,
        ),
    )
def _vendor_cif(
    *,
    vendor_asset_links: tuple[AssetVendorLinkInput, ...],
    vendor_process_links: tuple[ProcessVendorLinkInput, ...],
    asset_results: Mapping[int, AssetDerivation],
    process_results: Mapping[int, ProcessDerivation],
) -> tuple[str, int, int]:
    """07!cif — builder sheets_vendors.py:96-98, verbatim:

        =IF(COUNTIFS(10.vendorID,this,10.assetCIF,"Ano")
           +COUNTIFS(11§1.vendorID,this,11§1.processCIF,"Ano")>0,"Ano","Ne")

    Two independent any-true paths at once: via the Asset cascade and via the
    direct §1 Process pairs (NEVER the derived §2 section). Links whose
    counterpart row is absent contribute nothing (the per-link XLOOKUP columns
    default to blank). Returns (cif, asset-path hits, process-path hits).
    """
    cif_asset_hits = sum(
        1
        for link in vendor_asset_links
        if link.asset_id in asset_results and asset_results[link.asset_id].cif == ANO
    )
    cif_process_hits = sum(
        1
        for link in vendor_process_links
        if link.process_id in process_results and process_results[link.process_id].cif == ANO
    )
    cif = ANO if cif_asset_hits + cif_process_hits > 0 else NE
    return cif, cif_asset_hits, cif_process_hits


def _derive_vendor(
    row: VendorDerivationInput,
    *,
    cif: str,
    cif_asset_link_count: int,
    cif_process_link_count: int,
    vendor_asset_links: tuple[AssetVendorLinkInput, ...],
    manual_process_link_count: int,
    manual_cif_process_link_count: int,
    transitive_links: tuple[TransitiveProcessVendorLink, ...],
    asset_results: Mapping[int, AssetDerivation],
    contracts: tuple[VendorContractInput, ...],
    contract_cif: Mapping[int, str],
    sub_rows: tuple[SubOutsourcingInput, ...],
    sub_ranks: Mapping[int, int | None],
    contract_vendor_ids: Mapping[int, int],
) -> VendorDerivation:
    # kat_zeme — =IF(zeme="","",IFERROR(INDEX(ZemeKategorie,MATCH(zeme,
    # ZemeList,0)),"?")) (builder sheets_vendors.py:65-67).
    country_category = (
        None if row.country is None else COUNTRY_CATEGORIES.get(row.country, UNKNOWN_LOOKUP)
    )

    # aktiva_n / proc_n / cif_proc_n — builder :99-105: plain link tallies;
    # proc_n and cif_proc_n count BOTH the §1 pairs and the §2 triples.
    linked_asset_count = len(vendor_asset_links)
    transitive_pair_count = len(transitive_links)
    linked_process_count = manual_process_link_count + transitive_pair_count
    transitive_cif_count = sum(1 for link in transitive_links if link.process_cif == ANO)
    cif_process_count = manual_cif_process_link_count + transitive_cif_count

    # h_rank — =IFERROR(MAXIFS(10.assetCriticalityRank,10.vendorID,this),0)
    # (builder :153-154); the per-link rank is MATCH(04!vysledna, TridyKrit)
    # (builder :440-441), so this is the MAX-of-MAX over linked assets. No
    # matching links (or no ranked assets) resolve to 0.
    h_rank = max(
        (
            _criticality_rank(asset_results[link.asset_id].resulting_criticality)
            for link in vendor_asset_links
            if link.asset_id in asset_results
        ),
        default=0,
    )
    # max_krit — =IF(h_rank=0,"",CHOOSE(h_rank,...)) (builder :106-108).
    max_criticality = CRITICALITY_CLASSES[h_rank - 1] if h_rank > 0 else None

    # Contract tallies — h_smluv/h_hlavni (builder :161-164) and the block-B
    # main-contract lookups: XLOOKUP over the hidden vendor-if-main column
    # takes the FIRST main contract in row order (builder :70-84).
    contract_count = len(contracts)
    main_contracts = [contract for contract in contracts if contract.main_contract == ANO]
    main_contract_count = len(main_contracts)
    main_contract = main_contracts[0] if main_contracts else None

    # Chain memberships: rows whose SUBCONTRACTOR is this vendor (09!F=this).
    # Production-inert with inline sub-provider identity — see module docstring.
    rows_as_subcontractor = tuple(
        sub for sub in sub_rows if sub.sub_provider_vendor_id == row.id
    )
    # cif_ret — builder :124-126, verbatim:
    #   =IF(cif="Ano","Ano",IF(COUNTIFS(09.F,this,09.J,"Ano")>0,"Ano","Ne"))
    # 09!J carries the contract's prime-vendor CIF propagated uniformly.
    chain_cif_hit = any(
        contract_cif.get(sub.contract_id, NE) == ANO for sub in rows_as_subcontractor
    )
    cif_chain = ANO if cif == ANO or chain_cif_hit else NE

    # tier — builder :109-115, verbatim (spec 2.3(3)):
    #   =IF(cif_ret="Ano","Kritický dodavatel",
    #     IF(OR(N(h_rank)>=3,subst="Nenahraditelný",
    #           subst="Velmi obtížně nahraditelný",
    #           COUNTIFS(S17)+COUNTIFS(S18)+COUNTIFS(S19)>0),
    #        "Významný dodavatel","Standardní dodavatel"))
    # Reproduced with the "Významný" branch included even where structurally
    # unreachable under seed-shaped data (spec section 8 item 3).
    cloud_service_link_count = sum(
        1 for link in vendor_asset_links if link.ict_service_code in CLOUD_SERVICE_S_CODES
    )
    tier_max_rank_at_least_high = h_rank >= 3
    tier_substitutability_match = row.substitutability in _TIER_SUBSTITUTABILITY_TRIGGERS
    if cif_chain == ANO:
        tier = TIER_CRITICAL
    elif tier_max_rank_at_least_high or tier_substitutability_match or cloud_service_link_count > 0:
        tier = TIER_SIGNIFICANT
    else:
        tier = TIER_STANDARD

    # uroven_ret — builder :116-119, verbatim:
    #   =IF(N(h_smluv)+N(aktiva_n)+N(proc_n)>0,"A",
    #     IF(COUNTIFS(09.F,this,09.I,2)>0,"B",IF(COUNTIF(09.F,this)>0,"C","")))
    if contract_count + linked_asset_count + linked_process_count > 0:
        chain_level: str | None = CHAIN_LEVEL_OWN_LINKS
    elif any(sub_ranks.get(sub.id) == 2 for sub in rows_as_subcontractor):
        chain_level = CHAIN_LEVEL_DIRECT_SUB
    elif rows_as_subcontractor:
        chain_level = CHAIN_LEVEL_DEEP_SUB
    else:
        chain_level = None

    # subdod / subdod_n — builder :120-123: rows whose PARENT provider (09!E)
    # is this vendor — the direct rows under its contracts (parent = prime
    # vendor) plus rows whose predecessor's subcontractor is this vendor.
    direct_sub_rows = tuple(
        sub
        for sub in sub_rows
        if (
            sub.predecessor_id is None
            and contract_vendor_ids.get(sub.contract_id) == row.id
        )
        or (
            sub.predecessor_id is not None
            and any(
                parent.id == sub.predecessor_id and parent.sub_provider_vendor_id == row.id
                for parent in sub_rows
            )
        )
    )
    direct_sub_provider_names = tuple(
        sub.sub_provider_name for sub in direct_sub_rows if sub.sub_provider_name
    )
    direct_sub_provider_count = len(direct_sub_rows)

    # vyz_vysledek — =IF(COUNTIF(vyz_povoleni:vyz_kumul,"Ano")>0,"Ano","Ne")
    # (builder :134-136): any-true over the 6 EBA/GL significance criteria;
    # "Nerelevantní" never counts.
    significance_answers = (
        row.significance_authorization_conditions,
        row.significance_regulatory_requirements,
        row.significance_service_quality,
        row.significance_financial_impact,
        row.significance_reputation_continuity,
        row.significance_cumulative_impact,
    )
    significance_outcome = ANO if ANO in significance_answers else NE

    # hotovo — builder :142-148 (span constant above): identity block, the
    # main-contract pair spans, substitutability, exit plan, and the ex-ante
    # date REQUIRED only for the Kritický/Významný tiers.
    main_contract_reference = main_contract.contract_reference if main_contract else None
    main_contract_arrangement_type = main_contract.arrangement_type if main_contract else None
    main_contract_start_date = main_contract.start_date if main_contract else None
    main_contract_end_date = main_contract.end_date if main_contract else None
    main_contract_blank = {
        "main_contract_reference": main_contract_reference is None,
        "main_contract_arrangement_type": main_contract_arrangement_type is None,
        "main_contract_start_date": main_contract_start_date is None,
        "main_contract_end_date": main_contract_end_date is None,
    }
    missing: list[str] = [
        field_name
        for field_name in _VENDOR_COMPLETENESS_ENTERED_FIELDS
        if getattr(row, field_name) is None
    ]
    missing.extend(
        field_name
        for field_name in _VENDOR_COMPLETENESS_MAIN_CONTRACT_FIELDS
        if main_contract_blank[field_name]
    )
    if row.substitutability is None:
        missing.append("substitutability")
    if row.exit_plan_state is None:
        missing.append("exit_plan_state")
    if tier in (TIER_CRITICAL, TIER_SIGNIFICANT) and row.ex_ante_assessment_date is None:
        missing.append("ex_ante_assessment_date")
    missing_for_completeness = tuple(missing)

    return VendorDerivation(
        country_category=country_category,
        cif=cif,
        linked_asset_count=linked_asset_count,
        linked_process_count=linked_process_count,
        cif_process_count=cif_process_count,
        h_rank=h_rank,
        max_criticality=max_criticality,
        tier=tier,
        cif_chain=cif_chain,
        chain_level=chain_level,
        direct_sub_provider_names=direct_sub_provider_names,
        direct_sub_provider_count=direct_sub_provider_count,
        significance_outcome=significance_outcome,
        main_contract_reference=main_contract_reference,
        main_contract_arrangement_type=main_contract_arrangement_type,
        main_contract_start_date=main_contract_start_date,
        main_contract_end_date=main_contract_end_date,
        contract_count=contract_count,
        main_contract_count=main_contract_count,
        is_complete=not missing_for_completeness,
        inputs=VendorDerivedInputs(
            country=row.country,
            substitutability=row.substitutability,
            exit_plan_state=row.exit_plan_state,
            ex_ante_assessment_date=row.ex_ante_assessment_date,
            significance_authorization_conditions=row.significance_authorization_conditions,
            significance_regulatory_requirements=row.significance_regulatory_requirements,
            significance_service_quality=row.significance_service_quality,
            significance_financial_impact=row.significance_financial_impact,
            significance_reputation_continuity=row.significance_reputation_continuity,
            significance_cumulative_impact=row.significance_cumulative_impact,
            cif_asset_link_count=cif_asset_link_count,
            cif_process_link_count=cif_process_link_count,
            tier_cif_chain=cif_chain == ANO,
            tier_max_rank_at_least_high=tier_max_rank_at_least_high,
            tier_substitutability_match=tier_substitutability_match,
            cloud_service_link_count=cloud_service_link_count,
            manual_process_link_count=manual_process_link_count,
            transitive_process_pair_count=transitive_pair_count,
            missing_for_completeness=missing_for_completeness,
        ),
        transitive_process_links=transitive_links,
    )
