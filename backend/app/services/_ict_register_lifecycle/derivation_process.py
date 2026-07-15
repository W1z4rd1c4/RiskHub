"""Process derivation formulas for the ICT register."""

from __future__ import annotations

from ._derivation_impl import (
    _CLASS_CRITICAL,
    _PROCESS_COMPLETENESS_FIELDS,
    ANO,
    BCM_GAP,
    CHECK_OK,
    CRITICALITY_CLASSES,
    NE,
    RTO_MTPD_GAP,
    ProcessDerivation,
    ProcessDerivationInput,
    ProcessDerivedInputs,
    _add_one_year,
    _EffectiveParameters,
)

# Process rules (spec 2.1 + the derived 1.1 fields).
# ---------------------------------------------------------------------------

def _derive_process(
    row: ProcessDerivationInput,
    params: _EffectiveParameters,
    *,
    linked_asset_count: int,
    manual_vendor_link_count: int,
    transitive_vendor_pair_count: int,
    is_duplicate: bool,
) -> ProcessDerivation:
    impact_axes = (
        row.impact_client,
        row.impact_market_operations,
        row.impact_regulatory,
        row.impact_financial,
    )

    # skore: SUM of the four axes + MTPD speed bonus; blank unless all present.
    mtpd_bonus: int | None = None
    criticality_score: int | None = None
    if all(axis is not None for axis in impact_axes) and row.mtpd_hours is not None:
        if row.mtpd_hours <= params.mtpd_critical_hours:
            mtpd_bonus = params.bonus_critical
        elif row.mtpd_hours <= params.mtpd_medium_hours:
            mtpd_bonus = params.bonus_medium
        else:
            mtpd_bonus = params.bonus_default
        criticality_score = sum(axis for axis in impact_axes if axis is not None) + mtpd_bonus

    # trida: banding on the live score, else the entered preliminary class.
    if criticality_score is not None:
        if criticality_score >= params.critical_score:
            criticality_class: str | None = CRITICALITY_CLASSES[3]
        elif criticality_score >= params.high_score:
            criticality_class = CRITICALITY_CLASSES[2]
        elif criticality_score >= params.medium_score:
            criticality_class = CRITICALITY_CLASSES[1]
        else:
            criticality_class = CRITICALITY_CLASSES[0]
        criticality_class_source = "score"
    else:
        criticality_class = row.preliminary_criticality
        criticality_class_source = "preliminary"

    # CIF: override precedence, then OR of the three independent triggers.
    # The class trigger reads the derived trida INCLUDING its fallback.
    cif_class_critical = criticality_class == _CLASS_CRITICAL
    cif_mtpd_within_critical = row.mtpd_hours is not None and row.mtpd_hours <= params.mtpd_critical_hours
    entered_axes = [axis for axis in impact_axes if axis is not None]
    cif_any_impact_maximal = max(entered_axes, default=0) == 5
    if row.cif_override is not None:
        cif = row.cif_override
    elif cif_class_critical or cif_mtpd_within_critical or cif_any_impact_maximal:
        cif = ANO
    else:
        cif = NE

    # kontrola_rto — builder sheets_core.py:186, verbatim:
    #   =IF(OR(rto="",mtpd=""),"",IF(rto>mtpd,"GAP: RTO > MTPD","OK"))
    # A half-entered pair is BLANK, never "OK".
    rto_mtpd_check: str | None
    if row.rto_hours is None or row.mtpd_hours is None:
        rto_mtpd_check = None
    elif row.rto_hours > row.mtpd_hours:
        rto_mtpd_check = RTO_MTPD_GAP
    else:
        rto_mtpd_check = CHECK_OK
    # kontrola_bcm — builder sheets_core.py:190 (row-existence guard aside,
    # which database identity supersedes):
    #   =IF(AND(cif="Ano",bcm<>"Ano"),"GAP: CIF bez BCM","OK")
    bcm_check = BCM_GAP if cif == ANO and row.bcm_link != ANO else CHECK_OK

    next_review_date = _add_one_year(row.assessment_date) if row.assessment_date is not None else None

    missing_for_completeness = tuple(
        field_name for field_name in _PROCESS_COMPLETENESS_FIELDS if getattr(row, field_name) is None
    )

    return ProcessDerivation(
        criticality_score=criticality_score,
        criticality_class=criticality_class,
        cif=cif,
        rto_mtpd_check=rto_mtpd_check,
        bcm_check=bcm_check,
        next_review_date=next_review_date,
        linked_asset_count=linked_asset_count,
        # dod_n = COUNTIF(11§1) + COUNTIF(11§2) — the §2 triples count per
        # occurrence, never deduplicated by vendor (spec 1.1 ~137, 1.8 §2).
        linked_vendor_count=manual_vendor_link_count + transitive_vendor_pair_count,
        is_complete=not missing_for_completeness,
        is_duplicate=is_duplicate,
        inputs=ProcessDerivedInputs(
            impact_client=row.impact_client,
            impact_market_operations=row.impact_market_operations,
            impact_regulatory=row.impact_regulatory,
            impact_financial=row.impact_financial,
            mtpd_hours=row.mtpd_hours,
            mtpd_bonus=mtpd_bonus,
            threshold_critical_score=params.critical_score,
            threshold_high_score=params.high_score,
            threshold_medium_score=params.medium_score,
            mtpd_critical_hours=params.mtpd_critical_hours,
            mtpd_medium_hours=params.mtpd_medium_hours,
            preliminary_criticality=row.preliminary_criticality,
            criticality_class_source=criticality_class_source,
            cif_override=row.cif_override,
            cif_class_critical=cif_class_critical,
            cif_mtpd_within_critical=cif_mtpd_within_critical,
            cif_any_impact_maximal=cif_any_impact_maximal,
            rto_hours=row.rto_hours,
            bcm_link=row.bcm_link,
            assessment_date=row.assessment_date,
            missing_for_completeness=missing_for_completeness,
            manual_vendor_link_count=manual_vendor_link_count,
            transitive_vendor_pair_count=transitive_vendor_pair_count,
        ),
    )


# ---------------------------------------------------------------------------
