"""ICT Register derivation engine — the pure compute-on-read core (issue #48).

One deep module: register graph in, every derived value out. The formulas are
the workbook's, verbatim, per docs/dora-ict-register/dora-excel-functional-spec.md
(referenced below as "spec"): Process score/class/CIF and gap checks
(spec 2.1, 1.1), the Criticality cascade onto Assets — ``hodnota``,
``bus_krit``, the weighted ``skore``, ``h_rank``/``vysledna`` MAX aggregation,
``klas8``, CIF any-true, SPOF, ``ext_zavis``, ``legacy`` (spec 2.2, 2.3(1)) —
plus the count/list aggregates. Czech class labels come from the workbook's
``TridyKrit`` closed list, never re-spelled here.

Contract:
- **Pure**: no database session, no awaits, no persistence. Derived values are
  computed on read and never stored (parent spec #38: compute-on-read).
- **Parameters**: every threshold/bonus/date is read from the seeded
  :class:`IctWorkbookParameterSet` (ADR-008 overlay), never hardcoded.
- **Emptiness over absence**: inputs whose feeding register ships in a later
  ticket (Asset<->Vendor links and Process<->Vendor links, tickets #46/#49)
  are empty collections today; the rules still run verbatim over them
  (``ext_zavis`` = "Ne", vendor counts 0), so later tickets extend the graph
  without changing a rule.
- **Explain**: every derived block carries an ``inputs`` object exposing the
  values (and parameter thresholds) that produced it — the "why is this
  critical" story for the committee and auditors (#38 user story 14).

The async graph loader lives in the sibling ``derivation_inputs`` module;
golden tests drive this module directly (tests/backend/pytest/
test_ict_register_derivation.py).
"""

from __future__ import annotations

import calendar
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.services._ict_register_reference import closed_list_values
from app.services._ict_register_reference.parameters import IctWorkbookParameterSet

ANO = "Ano"
NE = "Ne"

# TridyKrit, verbatim: ("Nízká", "Střední", "Vysoká", "Kritická"); MATCH rank 1-4.
CRITICALITY_CLASSES: tuple[str, ...] = tuple(str(v) for v in closed_list_values("TridyKrit"))
_CLASS_CRITICAL = CRITICALITY_CLASSES[3]

CHECK_OK = "OK"
RTO_MTPD_GAP = "GAP: RTO > MTPD"
BCM_GAP = "GAP: CIF bez BCM"

ARTICLE8_CRITICAL = "Kritické"
ARTICLE8_NON_CRITICAL = "Nekritické"

# Weighted asset score (spec 2.2 step 4) — weights verbatim, summing to 1.00.
_ASSET_SCORE_WEIGHTS: tuple[Decimal, ...] = (
    Decimal("0.1"),  # C — confidentiality
    Decimal("0.1"),  # I — integrity
    Decimal("0.2"),  # A — availability
    Decimal("0.1"),  # Au — authenticity
    Decimal("0.2"),  # d_klient — client impact
    Decimal("0.2"),  # d_reg — regulatory impact
    Decimal("0.05"),  # nahr — substitutability rating
    Decimal("0.05"),  # zavis — vendor dependency rating
)

# Process completeness (hotovo, spec 1.1): owner/impacts/mtpd/rto/rpo/
# dopad_prer/datum. The reputational axis is structurally excluded — the
# workbook enters it but no formula reads it (spec section 8 item 10).
_PROCESS_COMPLETENESS_FIELDS: tuple[str, ...] = (
    "owner",
    "impact_client",
    "impact_market_operations",
    "impact_regulatory",
    "impact_financial",
    "mtpd_hours",
    "rto_hours",
    "rpo_hours",
    "interruption_impact",
    "assessment_date",
)


# ---------------------------------------------------------------------------
# Graph inputs — plain rows, entered fields only.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProcessDerivationInput:
    """One 03_Procesy row — the entered fields the engine reads (spec 1.1).

    ``impact_reputational`` is deliberately absent: it sits outside the summed
    ``d_klient:d_fin`` range and is read by no workbook formula (spec 2.1,
    section 8 item 10).
    """

    id: int
    l1_process: str
    l2_subprocess: str | None = None
    owner: str | None = None
    impact_client: int | None = None
    impact_market_operations: int | None = None
    impact_regulatory: int | None = None
    impact_financial: int | None = None
    mtpd_hours: int | None = None
    preliminary_criticality: str | None = None
    cif_override: str | None = None
    rto_hours: int | None = None
    rpo_hours: int | None = None
    bcm_link: str | None = None
    interruption_impact: str | None = None
    assessment_date: date | None = None


@dataclass(frozen=True)
class AssetDerivationInput:
    """One 04_Aktiva row — the entered fields the engine reads (spec 1.2)."""

    id: int
    name: str
    confidentiality_rating: int | None = None
    integrity_rating: int | None = None
    availability_rating: int | None = None
    authenticity_rating: int | None = None
    impact_client: int | None = None
    impact_regulatory: int | None = None
    substitutability_rating: int | None = None
    vendor_dependency_rating: int | None = None
    preliminary_criticality: str | None = None
    lifecycle_state: str | None = None
    standard_support_end_date: date | None = None


@dataclass(frozen=True)
class ProcessAssetLinkInput:
    """One sheet-05 link (Process<->Asset): SPOF and the primary designation."""

    process_id: int
    asset_id: int
    spof: str | None = None
    is_primary: bool = False


@dataclass(frozen=True)
class AssetAssetLinkInput:
    """One sheet-06 link (Asset<->Asset), directional: dependent -> supporting."""

    dependent_asset_id: int
    supporting_asset_id: int


@dataclass(frozen=True)
class AssetVendorLinkInput:
    """One sheet-10 link (Asset<->Vendor) — fed by ticket #46; empty until then."""

    asset_id: int
    vendor_id: int
    vendor_name: str | None = None
    ict_service_code: str | None = None
    contract_reference: str | None = None


@dataclass(frozen=True)
class ProcessVendorLinkInput:
    """One sheet-11 Process<->Vendor pair — fed by later tickets; empty until then."""

    process_id: int
    vendor_id: int


@dataclass(frozen=True)
class IctRegisterGraph:
    """The register graph slice the engine derives over."""

    processes: tuple[ProcessDerivationInput, ...] = ()
    assets: tuple[AssetDerivationInput, ...] = ()
    process_asset_links: tuple[ProcessAssetLinkInput, ...] = ()
    asset_asset_links: tuple[AssetAssetLinkInput, ...] = ()
    asset_vendor_links: tuple[AssetVendorLinkInput, ...] = ()
    process_vendor_links: tuple[ProcessVendorLinkInput, ...] = ()


# ---------------------------------------------------------------------------
# Derived outputs, each with its explain-inputs block.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProcessDerivedInputs:
    """The inputs (and parameter values) behind one Process's derived block."""

    impact_client: int | None
    impact_market_operations: int | None
    impact_regulatory: int | None
    impact_financial: int | None
    mtpd_hours: int | None
    mtpd_bonus: int | None
    threshold_critical_score: int
    threshold_high_score: int
    threshold_medium_score: int
    mtpd_critical_hours: int
    mtpd_medium_hours: int
    preliminary_criticality: str | None
    criticality_class_source: str
    cif_override: str | None
    cif_class_critical: bool
    cif_mtpd_within_critical: bool
    cif_any_impact_maximal: bool
    rto_hours: int | None
    bcm_link: str | None
    assessment_date: date | None
    missing_for_completeness: tuple[str, ...]


@dataclass(frozen=True)
class ProcessDerivation:
    """Every derived 03_Procesy value in ticket-#48 scope (spec 1.1, 2.1)."""

    criticality_score: int | None
    criticality_class: str | None
    cif: str
    # Blank (None) when RTO or MTPD is missing — the workbook formula's
    # OR(rto="",mtpd="") guard, verified against the builder source.
    rto_mtpd_check: str | None
    bcm_check: str
    next_review_date: date | None
    linked_asset_count: int
    linked_vendor_count: int
    is_complete: bool
    is_duplicate: bool
    inputs: ProcessDerivedInputs


@dataclass(frozen=True)
class AssetDerivedInputs:
    """The inputs (signals, ranks, and parameters) behind one Asset's block."""

    confidentiality_rating: int | None
    integrity_rating: int | None
    availability_rating: int | None
    authenticity_rating: int | None
    impact_client: int | None
    impact_regulatory: int | None
    substitutability_rating: int | None
    vendor_dependency_rating: int | None
    preliminary_criticality: str | None
    lifecycle_state: str | None
    standard_support_end_date: date | None
    reference_date: date
    threshold_low_score: int
    threshold_medium_score: int
    threshold_high_score: int
    primary_process_id: int | None
    rank_primary_process_criticality: int
    rank_score_criticality: int
    rank_preliminary_criticality: int
    rank_business_criticality: int
    rank_cif_floor: int


@dataclass(frozen=True)
class AssetDerivation:
    """Every derived 04_Aktiva value in ticket-#48 scope (spec 1.2, 2.2, 2.3(1))."""

    ciaa_value: int | None
    primary_process_name: str | None
    primary_process_criticality: str | None
    inherited_impact_operations: int | None
    inherited_impact_financial: int | None
    inherited_rto_hours: int | None
    business_criticality: str | None
    weighted_score: float | None
    score_criticality: str | None
    h_rank: int
    resulting_criticality: str | None
    article8_classification: str
    cif: str
    cif_process_count: int
    cif_process_names: tuple[str, ...]
    spof: str
    external_dependency: str
    legacy: str
    linked_process_count: int
    linked_vendor_count: int
    linked_asset_names: tuple[str, ...]
    vendor_names: tuple[str, ...]
    ict_service_codes: tuple[str, ...]
    contract_references: tuple[str, ...]
    inputs: AssetDerivedInputs


@dataclass(frozen=True)
class IctRegisterDerivation:
    """Derivations for every row in the graph, keyed by row id."""

    processes: Mapping[int, ProcessDerivation] = field(default_factory=dict)
    assets: Mapping[int, AssetDerivation] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Parameter unpacking — typed once, used everywhere.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _EffectiveParameters:
    critical_score: int
    high_score: int
    medium_score: int
    mtpd_critical_hours: int
    mtpd_medium_hours: int
    bonus_critical: int
    bonus_medium: int
    bonus_default: int
    asset_low_score: int
    asset_medium_score: int
    asset_high_score: int
    reference_date: date


def _int_parameter(parameters: IctWorkbookParameterSet, name: str) -> int:
    value = parameters.value(name)
    if not isinstance(value, int):
        raise TypeError(f"ICT Register workbook parameter '{name}' must be an int, got {value!r}")
    return value


def _date_parameter(parameters: IctWorkbookParameterSet, name: str) -> date:
    value = parameters.value(name)
    if not isinstance(value, date):
        raise TypeError(f"ICT Register workbook parameter '{name}' must be a date, got {value!r}")
    return value


def _effective_parameters(parameters: IctWorkbookParameterSet) -> _EffectiveParameters:
    return _EffectiveParameters(
        critical_score=_int_parameter(parameters, "P_KritSkore"),
        high_score=_int_parameter(parameters, "P_VysSkore"),
        medium_score=_int_parameter(parameters, "P_StrSkore"),
        mtpd_critical_hours=_int_parameter(parameters, "P_MTPDKrit"),
        mtpd_medium_hours=_int_parameter(parameters, "P_MTPDStr"),
        bonus_critical=_int_parameter(parameters, "P_BonusKrit"),
        bonus_medium=_int_parameter(parameters, "P_BonusStr"),
        bonus_default=_int_parameter(parameters, "P_BonusDef"),
        asset_low_score=_int_parameter(parameters, "P_AktNizka"),
        asset_medium_score=_int_parameter(parameters, "P_AktStredni"),
        asset_high_score=_int_parameter(parameters, "P_AktVysoka"),
        reference_date=_date_parameter(parameters, "P_RefDatum"),
    )


# ---------------------------------------------------------------------------
# Shared rule helpers.
# ---------------------------------------------------------------------------


def _criticality_rank(label: str | None) -> int:
    """MATCH(label, TridyKrit, 0) with IFERROR(...,0): 1-4, blank/unknown -> 0."""
    if label is None:
        return 0
    try:
        return CRITICALITY_CLASSES.index(label) + 1
    except ValueError:
        return 0


def _add_one_year(anchor: date) -> date:
    """EDATE-style + 12 months: day clamped to the target month's last day."""
    year = anchor.year + 1
    day = min(anchor.day, calendar.monthrange(year, anchor.month)[1])
    return date(year, anchor.month, day)


def process_display_name(l1_process: str, l2_subprocess: str | None) -> str:
    """The workbook's process name lookup: l1 [& " – " & l2] (spec 1.2)."""
    if l2_subprocess:
        return f"{l1_process} – {l2_subprocess}"
    return l1_process


# ---------------------------------------------------------------------------
# Process rules (spec 2.1 + the derived 1.1 fields).
# ---------------------------------------------------------------------------


def _derive_process(
    row: ProcessDerivationInput,
    params: _EffectiveParameters,
    *,
    linked_asset_count: int,
    linked_vendor_count: int,
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
        linked_vendor_count=linked_vendor_count,
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
        ),
    )


# ---------------------------------------------------------------------------
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
        if row.lifecycle_state == "Legacy"
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
        ),
    )


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------


def derive_ict_register(graph: IctRegisterGraph, parameters: IctWorkbookParameterSet) -> IctRegisterDerivation:
    """Derive every in-scope value for every row of the graph, workbook-verbatim.

    Processes derive first (their rules are row-local); Assets then consume the
    Process results through the cascade. Counts and aggregates are relative to
    the links present in the graph — the loader in ``derivation_inputs``
    guarantees a complete link closure for the rows a caller consumes.
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

    processes: dict[int, ProcessDerivation] = {}
    for row in graph.processes:
        processes[row.id] = _derive_process(
            row,
            params,
            linked_asset_count=process_link_counts.get(row.id, 0),
            linked_vendor_count=process_vendor_counts.get(row.id, 0),
            is_duplicate=process_id_counts[row.id] > 1,
        )

    processes_by_id = {row.id: row for row in graph.processes}
    asset_names_by_id = {asset.id: asset.name for asset in graph.assets}

    asset_links: dict[int, list[ProcessAssetLinkInput]] = {}
    for link in graph.process_asset_links:
        asset_links.setdefault(link.asset_id, []).append(link)

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

    return IctRegisterDerivation(processes=processes, assets=assets)
