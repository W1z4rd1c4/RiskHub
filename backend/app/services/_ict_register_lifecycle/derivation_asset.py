"""Asset derivation formulas for the ICT register."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import ROUND_HALF_UP, Decimal

from ._derivation_impl import (
    _ASSET_COMPLETENESS_FIELDS,
    _ASSET_COMPLETENESS_PRIMARY_PROCESS,
    _ASSET_SCORE_WEIGHTS,
    ANO,
    ARTICLE8_CRITICAL,
    ARTICLE8_NON_CRITICAL,
    CRITICALITY_CLASSES,
    NE,
    AssetAssetLinkInput,
    AssetDerivation,
    AssetDerivationInput,
    AssetDerivedInputs,
    AssetVendorLinkInput,
    ProcessAssetLinkInput,
    ProcessDerivation,
    ProcessDerivationInput,
    _criticality_rank,
    _EffectiveParameters,
    process_display_name,
)

# Asset rules (spec 2.2 "MAX princip" + the 2.3(1) cascade + derived 1.2 fields).
# ---------------------------------------------------------------------------

def _asset_score_class(score: int | Decimal, params: _EffectiveParameters) -> str:
    """Band a value on P_AktNizka/P_AktStredni/P_AktVysoka (<= each, else Kritická)."""
    if score <= params.asset_low_score:
        return CRITICALITY_CLASSES[0]
    if score <= params.asset_medium_score:
        return CRITICALITY_CLASSES[1]
    if score <= params.asset_high_score:
        return CRITICALITY_CLASSES[2]
    return CRITICALITY_CLASSES[3]


def _derive_asset(
    row: AssetDerivationInput,
    params: _EffectiveParameters,
    *,
    links: tuple[ProcessAssetLinkInput, ...],
    processes_by_id: Mapping[int, ProcessDerivationInput],
    process_results: Mapping[int, ProcessDerivation],
    asset_names_by_id: Mapping[int, str],
    asset_asset_links: tuple[AssetAssetLinkInput, ...],
    vendor_links: tuple[AssetVendorLinkInput, ...],
) -> AssetDerivation:
    # --- Primary-process lookups: single XLOOKUPs, never aggregates (spec 2.3(1)).
    primary_link = next((link for link in links if link.is_primary), None)
    primary_process = processes_by_id.get(primary_link.process_id) if primary_link else None
    primary_result = process_results.get(primary_link.process_id) if primary_link else None
    primary_process_id = primary_process.id if primary_process is not None else None
    primary_process_name = (
        process_display_name(primary_process.l1_process, primary_process.l2_subprocess)
        if primary_process is not None
        else None
    )
    primary_process_criticality = primary_result.criticality_class if primary_result is not None else None
    inherited_impact_operations = (
        primary_process.impact_market_operations if primary_process is not None else None
    )
    inherited_impact_financial = primary_process.impact_financial if primary_process is not None else None
    inherited_rto_hours = primary_process.rto_hours if primary_process is not None else None

    # --- hodnota: MAX(C,I,A,Au), blank unless all four scored (spec 2.2 step 1).
    ratings = (
        row.confidentiality_rating,
        row.integrity_rating,
        row.availability_rating,
        row.authenticity_rating,
    )
    ciaa_value = max(r for r in ratings if r is not None) if all(r is not None for r in ratings) else None

    # --- bus_krit: class of MAX over the present business impacts (spec 2.2 step 3).
    business_impacts = [
        value
        for value in (
            row.impact_client,
            row.impact_regulatory,
            inherited_impact_operations,
            inherited_impact_financial,
        )
        if value is not None
    ]
    business_criticality = _asset_score_class(max(business_impacts), params) if business_impacts else None

    # --- skore: the exact weighted sum, all 8 inputs required (spec 2.2 step 4).
    weighted_inputs = (
        row.confidentiality_rating,
        row.integrity_rating,
        row.availability_rating,
        row.authenticity_rating,
        row.impact_client,
        row.impact_regulatory,
        row.substitutability_rating,
        row.vendor_dependency_rating,
    )
    weighted_score_decimal: Decimal | None = None
    if all(value is not None for value in weighted_inputs):
        total = sum(
            (
                Decimal(value) * weight
                for value, weight in zip(weighted_inputs, _ASSET_SCORE_WEIGHTS)
                if value is not None
            ),
            Decimal(0),
        )
        # Excel ROUND(...,2) — half away from zero.
        weighted_score_decimal = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    score_criticality = (
        _asset_score_class(weighted_score_decimal, params) if weighted_score_decimal is not None else None
    )

    # --- CIF: ANY-true over every linked process's derived CIF (spec 2.3(1)).
    cif_processes = [
        processes_by_id[link.process_id]
        for link in links
        if link.process_id in process_results and process_results[link.process_id].cif == ANO
    ]
    cif = ANO if cif_processes else NE
    cif_process_names = tuple(
        process_display_name(process.l1_process, process.l2_subprocess) for process in cif_processes
    )

    # --- h_rank: the MAX aggregation over the row's own class signals plus the
    # CIF floor of "Střední" (spec 2.2 step 5). IFERROR(MATCH(...),0) -> rank 0.
    rank_primary = _criticality_rank(primary_process_criticality)
    rank_score = _criticality_rank(score_criticality)
    rank_preliminary = _criticality_rank(row.preliminary_criticality)
    rank_business = _criticality_rank(business_criticality)
    rank_cif_floor = 2 if cif == ANO else 0
    h_rank = max(rank_primary, rank_score, rank_preliminary, rank_business, rank_cif_floor)

    # --- vysledna: CHOOSE(h_rank, TridyKrit...) — blank at rank 0 (spec 2.2 step 6).
    resulting_criticality = CRITICALITY_CLASSES[h_rank - 1] if h_rank > 0 else None

    # --- klas8: Kritické iff vysledna in the top two classes (spec 1.2).
    article8_classification = (
        ARTICLE8_CRITICAL
        if resulting_criticality in (CRITICALITY_CLASSES[2], CRITICALITY_CLASSES[3])
        else ARTICLE8_NON_CRITICAL
    )

    # --- SPOF: ANY-true over the asset's 05-links (spec 2.2).
    spof = ANO if any(link.spof == ANO for link in links) else NE

    # --- Vendor-side aggregates run verbatim over the (empty until #46) input.
    external_dependency = ANO if vendor_links else NE
    vendor_names = tuple(link.vendor_name for link in vendor_links if link.vendor_name is not None)
    ict_service_codes = tuple(
        link.ict_service_code for link in vendor_links if link.ict_service_code is not None
    )
    contract_references = tuple(
        link.contract_reference for link in vendor_links if link.contract_reference is not None
    )

    # --- legacy: state or standard-support end before P_RefDatum (spec 1.2).
    legacy = (
        ANO
        if row.lifecycle_state == "legacy"
        or (row.standard_support_end_date is not None and row.standard_support_end_date < params.reference_date)
        else NE
    )

    # --- vazby_aktiv — builder sheets_core.py:388-389, verbatim:
    #   =TEXTJOIN(", ",TRUE,IF(06!B=$A{r},06!E,""))
    # 06!B is the DEPENDENT asset id, 06!E the SUPPORTING asset name: the list
    # is the assets THIS asset depends on — single direction, never both ends.
    linked_asset_names = tuple(
        asset_names_by_id[link.supporting_asset_id]
        for link in asset_asset_links
        if link.dependent_asset_id == row.id and link.supporting_asset_id in asset_names_by_id
    )

    # --- hotovo — builder sheets_core.py:400-406 (span constant above): every
    # entered completeness cell filled AND a primary Process designated. The
    # proc_id pseudo-field sits between the klasdat and c:au spans, as in the
    # formula's COUNTBLANK order.
    missing: list[str] = []
    for field_name in _ASSET_COMPLETENESS_FIELDS:
        if getattr(row, field_name) is None:
            missing.append(field_name)
        if field_name == "data_classification" and primary_link is None:
            missing.append(_ASSET_COMPLETENESS_PRIMARY_PROCESS)
    missing_for_completeness = tuple(missing)

    return AssetDerivation(
        ciaa_value=ciaa_value,
        primary_process_name=primary_process_name,
        primary_process_criticality=primary_process_criticality,
        inherited_impact_operations=inherited_impact_operations,
        inherited_impact_financial=inherited_impact_financial,
        inherited_rto_hours=inherited_rto_hours,
        business_criticality=business_criticality,
        weighted_score=float(weighted_score_decimal) if weighted_score_decimal is not None else None,
        score_criticality=score_criticality,
        h_rank=h_rank,
        resulting_criticality=resulting_criticality,
        article8_classification=article8_classification,
        cif=cif,
        cif_process_count=len(cif_processes),
        cif_process_names=cif_process_names,
        spof=spof,
        external_dependency=external_dependency,
        legacy=legacy,
        linked_process_count=len(links),
        linked_vendor_count=len(vendor_links),
        linked_asset_names=linked_asset_names,
        vendor_names=vendor_names,
        ict_service_codes=ict_service_codes,
        contract_references=contract_references,
        is_complete=not missing_for_completeness,
        inputs=AssetDerivedInputs(
            confidentiality_rating=row.confidentiality_rating,
            integrity_rating=row.integrity_rating,
            availability_rating=row.availability_rating,
            authenticity_rating=row.authenticity_rating,
            impact_client=row.impact_client,
            impact_regulatory=row.impact_regulatory,
            substitutability_rating=row.substitutability_rating,
            vendor_dependency_rating=row.vendor_dependency_rating,
            preliminary_criticality=row.preliminary_criticality,
            lifecycle_state=row.lifecycle_state,
            standard_support_end_date=row.standard_support_end_date,
            reference_date=params.reference_date,
            threshold_low_score=params.asset_low_score,
            threshold_medium_score=params.asset_medium_score,
            threshold_high_score=params.asset_high_score,
            primary_process_id=primary_process_id,
            rank_primary_process_criticality=rank_primary,
            rank_score_criticality=rank_score,
            rank_preliminary_criticality=rank_preliminary,
            rank_business_criticality=rank_business,
            rank_cif_floor=rank_cif_floor,
            missing_for_completeness=missing_for_completeness,
        ),
    )


# ---------------------------------------------------------------------------
