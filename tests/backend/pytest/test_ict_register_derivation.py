"""ICT Register derivation engine — golden fidelity suite (issue #48).

Two seams, per the parent spec (#38 "Testing Decisions"):

1. **The pure engine** (``app.services._ict_register_lifecycle.derivation``):
   golden, table-driven tests drive small synthetic register graphs through
   ``derive_ict_register`` and assert workbook-exact outputs. Every expected
   value below is a literal worked by hand from
   docs/dora-ict-register/dora-excel-functional-spec.md (sections 2.1, 2.2,
   2.3(1), 2.5 and the section-6 parameter table) — never recomputed with the
   engine's own arithmetic. Precedent: test_char_kri_overdue_backtracking.py
   (fixed dataset, matrix-driven).

2. **The HTTP seam** via ``client_factory``: derived blocks ride the Process
   and Asset Read payloads (detail + list) with their explain inputs, are
   recomputed from current data on read, honor the ADR-008 parameter overlay,
   and stay rejected on write.

Workbook rules under test (spec section references in each test):
- Process ``skore``/``trida``/``cif`` incl. MTPD bonus tiers, banding
  thresholds, the preliminary-class fallback, and CIF override precedence;
- gap checks ``kontrola_rto``/``kontrola_bcm``, ``pristi``, counts,
  completeness, and the duplicate-ID guard;
- Asset ``hodnota``, the primary-process lookups, ``bus_krit``, the exact
  weighted ``skore``, ``krit_skore``, ``h_rank``/``vysledna`` (MAX cascade,
  monotonic upward), ``klas8``, CIF any-true, SPOF, ``ext_zavis``,
  ``legacy``, and the count/list aggregates;
- vendor-side inputs are empty collections until tickets #46/#49 — the rules
  run verbatim over emptiness and extend without change.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models import User
from app.models.global_config import clear_config_cache
from app.services._ict_register_lifecycle.derivation import (
    AssetAssetLinkInput,
    AssetDerivationInput,
    AssetVendorLinkInput,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivationInput,
    ProcessVendorLinkInput,
    derive_ict_register,
)
from app.services._ict_register_reference.parameters import (
    ICT_WORKBOOK_PARAMETERS,
    IctParameterValue,
    IctWorkbookParameterSet,
)


@pytest.fixture(autouse=True)
def _clear_config_cache():
    clear_config_cache()
    yield
    clear_config_cache()


def parameter_set(**overrides: IctParameterValue) -> IctWorkbookParameterSet:
    """The verbatim workbook parameter set (spec section 6), with overrides."""
    values: dict[str, IctParameterValue] = {p.name: p.default for p in ICT_WORKBOOK_PARAMETERS}
    values.update(overrides)
    return IctWorkbookParameterSet(version=str(values["P_Verze"]), values=values)


def process_row(pid: int = 1, **overrides: object) -> ProcessDerivationInput:
    defaults: dict[str, object] = {"id": pid, "l1_process": f"Proces {pid}"}
    defaults.update(overrides)
    return ProcessDerivationInput(**defaults)  # type: ignore[arg-type]


def asset_row(aid: int = 1, **overrides: object) -> AssetDerivationInput:
    defaults: dict[str, object] = {"id": aid, "name": f"Aktivum {aid}"}
    defaults.update(overrides)
    return AssetDerivationInput(**defaults)  # type: ignore[arg-type]


def derive_single_process(row: ProcessDerivationInput, params: IctWorkbookParameterSet | None = None):
    result = derive_ict_register(IctRegisterGraph(processes=(row,)), params or parameter_set())
    return result.processes[row.id]


# ===========================================================================
# Seam 1 — pure engine: Process rules (spec section 2.1)
# ===========================================================================

# (impacts (klient, trh, reg, fin), mtpd, expected skore, expected trida).
# skore = SUM(4 axes) + MTPD bonus (<=4h -> +5, <=24h -> +3, else +1);
# trida bands: >=16 Kritická, >=12 Vysoká, >=8 Střední, else Nízká.
_SCORE_BANDING_MATRIX: list[tuple[tuple[int, int, int, int], int, int, str]] = [
    ((5, 5, 5, 5), 4, 25, "Kritická"),  # score ceiling: 20 + 5
    ((4, 4, 4, 4), 4, 21, "Kritická"),
    ((3, 4, 4, 4), 25, 16, "Kritická"),  # P_KritSkore edge: exactly 16
    ((3, 4, 4, 3), 25, 15, "Vysoká"),  # one below the Kritická edge
    ((3, 3, 3, 2), 25, 12, "Vysoká"),  # P_VysSkore edge: exactly 12
    ((3, 3, 2, 2), 25, 11, "Střední"),
    ((2, 2, 2, 1), 25, 8, "Střední"),  # P_StrSkore edge: exactly 8
    ((2, 2, 1, 1), 25, 7, "Nízká"),
    ((1, 1, 1, 1), 4, 9, "Střední"),  # MTPD bonus tier: <=4h -> +5
    ((1, 1, 1, 1), 5, 7, "Nízká"),  # first hour past the critical tier -> +3
    ((1, 1, 1, 1), 24, 7, "Nízká"),  # MTPD bonus tier edge: <=24h -> +3
    ((1, 1, 1, 1), 25, 5, "Nízká"),  # score floor: 4 + default bonus 1
]


@pytest.mark.parametrize(("impacts", "mtpd", "expected_score", "expected_class"), _SCORE_BANDING_MATRIX)
def test_process_score_and_banding_matrix(
    impacts: tuple[int, int, int, int], mtpd: int, expected_score: int, expected_class: str
):
    klient, trh, reg, fin = impacts
    derived = derive_single_process(
        process_row(
            impact_client=klient,
            impact_market_operations=trh,
            impact_regulatory=reg,
            impact_financial=fin,
            mtpd_hours=mtpd,
        )
    )
    assert derived.criticality_score == expected_score
    assert derived.criticality_class == expected_class
    # The class label is verbatim TridyKrit Czech — no translation, no casing drift.
    assert derived.criticality_class in ("Nízká", "Střední", "Vysoká", "Kritická")


def test_process_score_blank_unless_all_four_axes_and_mtpd_present():
    """skore = "" when COUNT(d_klient:d_fin)<4 or mtpd="" (spec 2.1)."""
    incomplete_axes = derive_single_process(
        process_row(impact_client=5, impact_market_operations=5, impact_regulatory=5, mtpd_hours=4)
    )
    assert incomplete_axes.criticality_score is None

    missing_mtpd = derive_single_process(
        process_row(
            impact_client=5, impact_market_operations=5, impact_regulatory=5, impact_financial=5
        )
    )
    assert missing_mtpd.criticality_score is None
    assert missing_mtpd.inputs.mtpd_bonus is None


def test_process_class_falls_back_to_entered_preliminary_class_when_score_blank():
    """trida = IF(skore<>"", bands, predbezna) — the manual/seeded fallback (spec 2.1)."""
    fallback = derive_single_process(process_row(preliminary_criticality="Vysoká"))
    assert fallback.criticality_score is None
    assert fallback.criticality_class == "Vysoká"
    assert fallback.inputs.criticality_class_source == "preliminary"

    no_fallback = derive_single_process(process_row())
    assert no_fallback.criticality_class is None

    banded = derive_single_process(
        process_row(
            impact_client=4,
            impact_market_operations=4,
            impact_regulatory=4,
            impact_financial=4,
            mtpd_hours=4,
            preliminary_criticality="Nízká",
        )
    )
    # A live score always wins over the entered preliminary class.
    assert banded.criticality_class == "Kritická"
    assert banded.inputs.criticality_class_source == "score"


# CIF = override, else OR(trida="Kritická", mtpd<=P_MTPDKrit, MAX(axes)=5) (spec 2.1).
_CIF_MATRIX: list[tuple[dict[str, object], str, str]] = [
    # Explicit-No override beats every derived-Yes trigger at once.
    (
        {
            "cif_override": "Ne",
            "impact_client": 5,
            "impact_market_operations": 4,
            "impact_regulatory": 4,
            "impact_financial": 4,
            "mtpd_hours": 4,
        },
        "Ne",
        "override",
    ),
    # Explicit-Yes override beats a derived No.
    (
        {
            "cif_override": "Ano",
            "impact_client": 1,
            "impact_market_operations": 1,
            "impact_regulatory": 1,
            "impact_financial": 1,
            "mtpd_hours": 100,
        },
        "Ano",
        "override",
    ),
    # Trigger 1: banded class Kritická (score 17 >= 16), no other trigger.
    (
        {
            "impact_client": 4,
            "impact_market_operations": 4,
            "impact_regulatory": 4,
            "impact_financial": 4,
            "mtpd_hours": 25,
        },
        "Ano",
        "class",
    ),
    # Trigger 2: MTPD <= P_MTPDKrit alone (class only Střední).
    (
        {
            "impact_client": 1,
            "impact_market_operations": 1,
            "impact_regulatory": 1,
            "impact_financial": 1,
            "mtpd_hours": 4,
        },
        "Ano",
        "mtpd",
    ),
    # Trigger 3: a single axis at 5 alone (score 9, class Střední).
    (
        {
            "impact_client": 5,
            "impact_market_operations": 1,
            "impact_regulatory": 1,
            "impact_financial": 1,
            "mtpd_hours": 25,
        },
        "Ano",
        "axis",
    ),
    # Vysoká class, MTPD 25, max axis 4 -> no trigger fires.
    (
        {
            "impact_client": 4,
            "impact_market_operations": 4,
            "impact_regulatory": 3,
            "impact_financial": 3,
            "mtpd_hours": 25,
        },
        "Ne",
        "none",
    ),
    # The trida trigger reads the DERIVED class incl. its preliminary fallback.
    ({"preliminary_criticality": "Kritická"}, "Ano", "class"),
    ({"preliminary_criticality": "Vysoká"}, "Ne", "none"),
    # Fully blank row: no override, no trigger -> Ne.
    ({}, "Ne", "none"),
]


@pytest.mark.parametrize(("fields", "expected_cif", "reason"), _CIF_MATRIX)
def test_process_cif_override_precedence_and_triggers(
    fields: dict[str, object], expected_cif: str, reason: str
):
    derived = derive_single_process(process_row(**fields))
    assert derived.cif == expected_cif

    # The explain block tells the "why": override value and per-trigger booleans.
    inputs = derived.inputs
    if reason == "override":
        assert inputs.cif_override == expected_cif
    elif reason == "class":
        assert inputs.cif_class_critical is True
    elif reason == "mtpd":
        assert (inputs.cif_class_critical, inputs.cif_mtpd_within_critical) == (False, True)
    elif reason == "axis":
        assert (inputs.cif_class_critical, inputs.cif_mtpd_within_critical) == (False, False)
        assert inputs.cif_any_impact_maximal is True
    else:
        assert (
            inputs.cif_class_critical,
            inputs.cif_mtpd_within_critical,
            inputs.cif_any_impact_maximal,
        ) == (False, False, False)


def test_process_rto_mtpd_gap_check():
    """kontrola_rto — the workbook builder formula, verbatim (sheets_core.py:186):

    ``=IF(OR(rto="",mtpd=""),"",IF(rto>mtpd,"GAP: RTO > MTPD","OK"))``

    A half-entered pair is BLANK (None) — neither "OK" nor a gap.
    """
    gap = derive_single_process(process_row(rto_hours=5, mtpd_hours=4))
    assert gap.rto_mtpd_check == "GAP: RTO > MTPD"

    equal = derive_single_process(process_row(rto_hours=4, mtpd_hours=4))
    assert equal.rto_mtpd_check == "OK"

    # The OR(rto="",mtpd="") guard blanks every half-entered pair.
    assert derive_single_process(process_row(rto_hours=5)).rto_mtpd_check is None
    assert derive_single_process(process_row(mtpd_hours=4)).rto_mtpd_check is None
    assert derive_single_process(process_row()).rto_mtpd_check is None


def test_process_bcm_gap_check_fires_for_cif_without_bcm_yes():
    """kontrola_bcm: GAP: CIF bez BCM if cif="Ano" and bcm<>"Ano" (spec section 1.1)."""
    cif_fields: dict[str, object] = {"cif_override": "Ano"}

    assert derive_single_process(process_row(**cif_fields)).bcm_check == "GAP: CIF bez BCM"
    assert (
        derive_single_process(process_row(bcm_link="Neposouzeno", **cif_fields)).bcm_check
        == "GAP: CIF bez BCM"
    )
    assert derive_single_process(process_row(bcm_link="Ano", **cif_fields)).bcm_check == "OK"
    # A non-CIF process never gaps, entered BCM or not.
    assert derive_single_process(process_row()).bcm_check == "OK"


def test_process_next_review_is_last_assessment_plus_one_year():
    """pristi = datum + 1 year (spec section 1.1)."""
    derived = derive_single_process(process_row(assessment_date=date(2026, 6, 1)))
    assert derived.next_review_date == date(2027, 6, 1)

    # Feb 29 clamps to the last day of the month, EDATE-style.
    leap = derive_single_process(process_row(assessment_date=date(2024, 2, 29)))
    assert leap.next_review_date == date(2025, 2, 28)

    assert derive_single_process(process_row()).next_review_date is None


def test_process_completeness_flag_and_missing_field_list():
    """hotovo over owner/impacts/mtpd/rto/rpo/dopad_prer/datum (spec section 1.1).

    The reputational axis is structurally excluded: the workbook enters it but
    no formula reads it (spec section 8 item 10), so completeness cannot
    require it — the engine input does not even carry the field.
    """
    complete_fields: dict[str, object] = {
        "owner": "Provozní úsek",
        "impact_client": 4,
        "impact_market_operations": 3,
        "impact_regulatory": 2,
        "impact_financial": 5,
        "mtpd_hours": 24,
        "rto_hours": 8,
        "rpo_hours": 4,
        "interruption_impact": "Vysoký",
        "assessment_date": date(2026, 6, 1),
    }
    complete = derive_single_process(process_row(**complete_fields))
    assert complete.is_complete is True
    assert complete.inputs.missing_for_completeness == ()

    partial_fields = dict(complete_fields)
    del partial_fields["rto_hours"]
    del partial_fields["owner"]
    partial = derive_single_process(process_row(**partial_fields))
    assert partial.is_complete is False
    assert partial.inputs.missing_for_completeness == ("owner", "rto_hours")


def test_process_duplicate_id_guard():
    """dup = COUNTIF(ProcesniID, own id) > 1 (spec section 1.1, hidden helper)."""
    graph = IctRegisterGraph(
        processes=(process_row(1), process_row(1), process_row(2)),
    )
    result = derive_ict_register(graph, parameter_set())
    assert result.processes[1].is_duplicate is True
    assert result.processes[2].is_duplicate is False


def test_process_link_counts_and_vendor_emptiness():
    """aktiva_n counts sheet-05 links; dod_n runs verbatim over the (empty) vendor input."""
    graph = IctRegisterGraph(
        processes=(process_row(1), process_row(2)),
        assets=(asset_row(11), asset_row(12)),
        process_asset_links=(
            ProcessAssetLinkInput(process_id=1, asset_id=11),
            ProcessAssetLinkInput(process_id=1, asset_id=12),
        ),
    )
    result = derive_ict_register(graph, parameter_set())
    assert result.processes[1].linked_asset_count == 2
    assert result.processes[2].linked_asset_count == 0
    # Ticket #46/#49 territory arrives as an empty collection today: count 0.
    assert result.processes[1].linked_vendor_count == 0

    # The same rule, fed a synthetic vendor link, counts without being changed.
    linked = derive_ict_register(
        IctRegisterGraph(
            processes=(process_row(1),),
            process_vendor_links=(ProcessVendorLinkInput(process_id=1, vendor_id=7),),
        ),
        parameter_set(),
    )
    assert linked.processes[1].linked_vendor_count == 1


def test_process_banding_shifts_with_parameter_overlay():
    """Changing P_KritSkore through the parameter set moves the banding edge."""
    row = process_row(
        impact_client=4,
        impact_market_operations=4,
        impact_regulatory=4,
        impact_financial=4,
        mtpd_hours=25,
    )
    assert derive_single_process(row).criticality_class == "Kritická"  # 17 >= 16

    shifted = derive_single_process(row, parameter_set(P_KritSkore=18))
    assert shifted.criticality_score == 17
    assert shifted.criticality_class == "Vysoká"  # 17 < 18 now
    assert shifted.inputs.threshold_critical_score == 18


def test_process_explain_inputs_expose_score_ingredients():
    derived = derive_single_process(
        process_row(
            impact_client=1,
            impact_market_operations=2,
            impact_regulatory=3,
            impact_financial=4,
            mtpd_hours=4,
        )
    )
    inputs = derived.inputs
    assert (
        inputs.impact_client,
        inputs.impact_market_operations,
        inputs.impact_regulatory,
        inputs.impact_financial,
    ) == (1, 2, 3, 4)
    assert inputs.mtpd_hours == 4
    assert inputs.mtpd_bonus == 5
    assert (inputs.threshold_critical_score, inputs.threshold_high_score, inputs.threshold_medium_score) == (
        16,
        12,
        8,
    )
    assert (inputs.mtpd_critical_hours, inputs.mtpd_medium_hours) == (4, 24)


# ===========================================================================
# Seam 1 — pure engine: Asset rules (spec 2.2, 2.3(1), 1.2)
# ===========================================================================

# Process rows reused across asset graphs. CIF/no-CIF is fixed via the
# override so each process's class stays an independent, readable literal.
_P_CRITICAL_NO_CIF = process_row(
    101, preliminary_criticality="Kritická", cif_override="Ne", l2_subprocess="Varianta A"
)
_P_HIGH = process_row(
    102,
    impact_client=3,
    impact_market_operations=3,
    impact_regulatory=3,
    impact_financial=2,
    mtpd_hours=25,  # score 12 -> Vysoká, no CIF trigger
    rto_hours=8,
)
_P_CIF_LOW = process_row(103, cif_override="Ano")  # class blank, CIF forced Ano
_P_LOW = process_row(
    104,
    impact_client=1,
    impact_market_operations=1,
    impact_regulatory=1,
    impact_financial=1,
    mtpd_hours=25,  # score 5 -> Nízká, CIF Ne
)


def derive_single_asset(
    row: AssetDerivationInput,
    *,
    processes: tuple[ProcessDerivationInput, ...] = (),
    process_asset_links: tuple[ProcessAssetLinkInput, ...] = (),
    asset_asset_links: tuple[AssetAssetLinkInput, ...] = (),
    asset_vendor_links: tuple[AssetVendorLinkInput, ...] = (),
    extra_assets: tuple[AssetDerivationInput, ...] = (),
    params: IctWorkbookParameterSet | None = None,
):
    graph = IctRegisterGraph(
        processes=processes,
        assets=(row, *extra_assets),
        process_asset_links=process_asset_links,
        asset_asset_links=asset_asset_links,
        asset_vendor_links=asset_vendor_links,
    )
    return derive_ict_register(graph, params or parameter_set()).assets[row.id]


def test_asset_worked_example_veris():
    """The spec's golden path (spec 2.5): Veris-shaped asset, all values at once."""
    derived = derive_single_asset(
        asset_row(
            6,
            confidentiality_rating=5,
            integrity_rating=5,
            availability_rating=5,
            authenticity_rating=5,
            impact_client=5,
            impact_regulatory=5,
            substitutability_rating=5,
            vendor_dependency_rating=4,
            preliminary_criticality="Kritická",
            lifecycle_state="V provozu",
        ),
        processes=(_P_CIF_LOW,),
        process_asset_links=(ProcessAssetLinkInput(process_id=103, asset_id=6, is_primary=True),),
    )
    assert derived.ciaa_value == 5  # MAX(5,5,5,5)
    assert derived.weighted_score == 4.95  # spec 2.5 literal
    assert derived.score_criticality == "Kritická"  # 4.95 > P_AktVysoka=4
    assert derived.business_criticality == "Kritická"  # MAX(5,5,-,-): 5 alone is enough
    assert derived.h_rank == 4
    assert derived.resulting_criticality == "Kritická"
    assert derived.article8_classification == "Kritické"
    assert derived.cif == "Ano"


def test_asset_ciaa_value_blank_unless_all_four_ratings_scored():
    """hodnota = MAX(C,I,A,Au), blank unless all 4 scored (spec 2.2 step 1)."""
    scored = derive_single_asset(
        asset_row(
            1,
            confidentiality_rating=2,
            integrity_rating=4,
            availability_rating=3,
            authenticity_rating=1,
        )
    )
    assert scored.ciaa_value == 4

    partial = derive_single_asset(
        asset_row(1, confidentiality_rating=5, integrity_rating=5, availability_rating=5)
    )
    assert partial.ciaa_value is None


# All 8 weighted inputs equal -> score == that value exactly; the P_Akt* bands
# are <=2 Nízká, <=3 Střední, <=4 Vysoká, else Kritická (spec 2.2 step 4).
_WEIGHTED_SCORE_MATRIX: list[tuple[int, float, str]] = [
    (1, 1.0, "Nízká"),
    (2, 2.0, "Nízká"),  # P_AktNizka edge
    (3, 3.0, "Střední"),  # P_AktStredni edge
    (4, 4.0, "Vysoká"),  # P_AktVysoka edge
    (5, 5.0, "Kritická"),
]


@pytest.mark.parametrize(("uniform_value", "expected_score", "expected_class"), _WEIGHTED_SCORE_MATRIX)
def test_asset_weighted_score_banding_matrix(uniform_value: int, expected_score: float, expected_class: str):
    derived = derive_single_asset(
        asset_row(
            1,
            confidentiality_rating=uniform_value,
            integrity_rating=uniform_value,
            availability_rating=uniform_value,
            authenticity_rating=uniform_value,
            impact_client=uniform_value,
            impact_regulatory=uniform_value,
            substitutability_rating=uniform_value,
            vendor_dependency_rating=uniform_value,
        )
    )
    assert derived.weighted_score == expected_score
    assert derived.score_criticality == expected_class


def test_asset_weighted_score_requires_all_eight_inputs():
    """skore requires all 8 named inputs non-blank (spec 2.2 step 4)."""
    derived = derive_single_asset(
        asset_row(
            1,
            confidentiality_rating=5,
            integrity_rating=5,
            availability_rating=5,
            authenticity_rating=5,
            impact_client=5,
            impact_regulatory=5,
            substitutability_rating=5,
            # vendor_dependency_rating missing
        )
    )
    assert derived.weighted_score is None
    assert derived.score_criticality is None


def test_asset_weighted_score_uses_the_exact_workbook_weights():
    """C*0.1 + I*0.1 + A*0.2 + Au*0.1 + klient*0.2 + reg*0.2 + nahr*0.05 + zavis*0.05."""
    derived = derive_single_asset(
        asset_row(
            1,
            confidentiality_rating=3,
            integrity_rating=2,
            availability_rating=1,
            authenticity_rating=2,
            impact_client=2,
            impact_regulatory=2,
            substitutability_rating=2,
            vendor_dependency_rating=2,
        )
    )
    # 0.3 + 0.2 + 0.2 + 0.2 + 0.4 + 0.4 + 0.1 + 0.1 = 1.9 (hand-computed)
    assert derived.weighted_score == 1.9


def test_asset_business_criticality_is_class_of_max_business_impact():
    """bus_krit = class of MAX(d_klient, d_reg, d_provoz, d_fin) (spec 2.2 step 3)."""
    # The two inherited axes come from the primary process (trh=3, fin=2).
    inherited = derive_single_asset(
        asset_row(1, impact_client=1, impact_regulatory=1),
        processes=(_P_HIGH,),
        process_asset_links=(ProcessAssetLinkInput(process_id=102, asset_id=1, is_primary=True),),
    )
    assert inherited.inherited_impact_operations == 3
    assert inherited.inherited_impact_financial == 2
    assert inherited.business_criticality == "Střední"  # MAX(1,1,3,2)=3

    # A single manual 5 is enough regardless of blank inherited axes (spec 2.5).
    manual_only = derive_single_asset(asset_row(1, impact_client=5))
    assert manual_only.business_criticality == "Kritická"

    assert derive_single_asset(asset_row(1)).business_criticality is None

    assert derive_single_asset(asset_row(1, impact_client=2)).business_criticality == "Nízká"
    assert derive_single_asset(asset_row(1, impact_regulatory=4)).business_criticality == "Vysoká"


def test_asset_h_rank_never_below_primary_process_criticality():
    """The cascade is monotonic upward: an Asset never reads less critical
    than its designated primary Process (spec 2.2 steps 5-6, Metodika quote)."""
    derived = derive_single_asset(
        asset_row(1),  # nothing entered on the asset itself
        processes=(_P_CRITICAL_NO_CIF,),
        process_asset_links=(ProcessAssetLinkInput(process_id=101, asset_id=1, is_primary=True),),
    )
    assert derived.primary_process_criticality == "Kritická"
    assert derived.h_rank == 4
    assert derived.resulting_criticality == "Kritická"
    assert derived.article8_classification == "Kritické"
    # CIF stayed Ne (the primary process carries an explicit-Ne override).
    assert derived.cif == "Ne"
    assert derived.inputs.rank_primary_process_criticality == 4
    assert derived.inputs.rank_cif_floor == 0


def test_asset_own_signals_only_raise_above_the_primary_process():
    derived = derive_single_asset(
        asset_row(
            1,
            confidentiality_rating=5,
            integrity_rating=5,
            availability_rating=5,
            authenticity_rating=5,
            impact_client=5,
            impact_regulatory=5,
            substitutability_rating=5,
            vendor_dependency_rating=5,
        ),
        processes=(_P_LOW,),
        process_asset_links=(ProcessAssetLinkInput(process_id=104, asset_id=1, is_primary=True),),
    )
    assert derived.primary_process_criticality == "Nízká"
    assert derived.score_criticality == "Kritická"  # own weighted score 5.0
    assert derived.resulting_criticality == "Kritická"


def test_asset_cif_floor_lifts_resulting_criticality_to_stredni():
    """IF(cif="Ano",2,0): a CIF-supporting asset never reads below Střední."""
    derived = derive_single_asset(
        asset_row(1, preliminary_criticality="Nízká"),
        processes=(_P_CIF_LOW,),
        process_asset_links=(ProcessAssetLinkInput(process_id=103, asset_id=1),),
    )
    assert derived.cif == "Ano"
    assert derived.inputs.rank_preliminary_criticality == 1
    assert derived.inputs.rank_cif_floor == 2
    assert derived.h_rank == 2
    assert derived.resulting_criticality == "Střední"


def test_asset_primary_process_missing_contributes_rank_zero():
    """No primary designation: the lookups blank and the rank signal is 0,
    while non-primary links still feed CIF (spec 2.3(1))."""
    derived = derive_single_asset(
        asset_row(1),
        processes=(_P_CIF_LOW,),
        process_asset_links=(ProcessAssetLinkInput(process_id=103, asset_id=1),),  # not primary
    )
    assert derived.primary_process_name is None
    assert derived.primary_process_criticality is None
    assert derived.inherited_impact_operations is None
    assert derived.inherited_impact_financial is None
    assert derived.inherited_rto_hours is None
    assert derived.inputs.primary_process_id is None
    assert derived.inputs.rank_primary_process_criticality == 0
    # CIF any-true still saw the linked process -> floor 2 -> Střední.
    assert derived.resulting_criticality == "Střední"


def test_asset_empty_links_h_rank_zero_blanks_the_resulting_class():
    """Empty links + nothing entered: h_rank 0, no resulting class (issue #48 AC)."""
    derived = derive_single_asset(asset_row(1))
    assert derived.h_rank == 0
    assert derived.resulting_criticality is None
    assert derived.article8_classification == "Nekritické"
    assert derived.cif == "Ne"
    assert derived.spof == "Ne"
    assert derived.linked_process_count == 0
    assert derived.cif_process_count == 0
    assert derived.cif_process_names == ()


def test_asset_klas8_binary_over_the_top_two_classes():
    """klas8 = Kritické iff vysledna in {Kritická, Vysoká} (spec 1.2)."""
    high = derive_single_asset(asset_row(1, preliminary_criticality="Vysoká"))
    assert high.resulting_criticality == "Vysoká"
    assert high.article8_classification == "Kritické"

    medium = derive_single_asset(asset_row(1, preliminary_criticality="Střední"))
    assert medium.resulting_criticality == "Střední"
    assert medium.article8_classification == "Nekritické"


def test_asset_cif_any_true_across_all_linked_processes():
    """04!cif is an ANY-true/OR over every linked process's derived CIF."""
    derived = derive_single_asset(
        asset_row(1),
        processes=(_P_LOW, _P_CIF_LOW, _P_CRITICAL_NO_CIF),
        process_asset_links=(
            ProcessAssetLinkInput(process_id=104, asset_id=1, is_primary=True),
            ProcessAssetLinkInput(process_id=103, asset_id=1),
            ProcessAssetLinkInput(process_id=101, asset_id=1),
        ),
    )
    assert derived.cif == "Ano"
    assert derived.cif_process_count == 1  # only the forced-Ano process counts
    assert derived.cif_process_names == ("Proces 103",)
    assert derived.linked_process_count == 3

    none_cif = derive_single_asset(
        asset_row(1),
        processes=(_P_LOW,),
        process_asset_links=(ProcessAssetLinkInput(process_id=104, asset_id=1, is_primary=True),),
    )
    assert none_cif.cif == "Ne"


def test_asset_cif_process_names_use_the_workbook_display_name():
    """Process names join as l1 [– l2], the workbook's lookup shape (spec 1.2)."""
    cif_with_l2 = process_row(
        105, l1_process="Sjednání pojištění", l2_subprocess="Online", cif_override="Ano"
    )
    derived = derive_single_asset(
        asset_row(1),
        processes=(cif_with_l2,),
        process_asset_links=(ProcessAssetLinkInput(process_id=105, asset_id=1, is_primary=True),),
    )
    assert derived.cif_process_names == ("Sjednání pojištění – Online",)
    assert derived.primary_process_name == "Sjednání pojištění – Online"


def test_asset_spof_any_true_over_process_asset_links():
    """spof = Ano if any 05-link has SPOF=Ano (spec 2.2)."""
    derived = derive_single_asset(
        asset_row(1),
        processes=(_P_LOW, _P_HIGH),
        process_asset_links=(
            ProcessAssetLinkInput(process_id=104, asset_id=1, spof="Ne"),
            ProcessAssetLinkInput(process_id=102, asset_id=1, spof="Ano"),
        ),
    )
    assert derived.spof == "Ano"

    unset = derive_single_asset(
        asset_row(1),
        processes=(_P_LOW,),
        process_asset_links=(ProcessAssetLinkInput(process_id=104, asset_id=1),),
    )
    assert unset.spof == "Ne"


def test_asset_primary_process_lookups_inherit_from_the_one_primary():
    """proc_nazev/proc_krit/d_provoz/d_fin/rto_ded are single XLOOKUPs against
    the designated primary Process, not aggregates (spec 2.3(1))."""
    derived = derive_single_asset(
        asset_row(1),
        processes=(_P_HIGH, _P_CIF_LOW),
        process_asset_links=(
            ProcessAssetLinkInput(process_id=102, asset_id=1, is_primary=True),
            ProcessAssetLinkInput(process_id=103, asset_id=1),
        ),
    )
    assert derived.primary_process_name == "Proces 102"
    assert derived.primary_process_criticality == "Vysoká"
    assert derived.inherited_impact_operations == 3  # 03!d_trh of the primary
    assert derived.inherited_impact_financial == 2  # 03!d_fin of the primary
    assert derived.inherited_rto_hours == 8  # 03!rto of the primary
    assert derived.inputs.primary_process_id == 102


def test_asset_external_dependency_and_vendor_aggregates_run_over_emptiness():
    """ext_zavis/dod_n and the vendor TEXTJOIN aggregates read the (empty)
    Asset<->Vendor input today; ticket #46 extends the graph, not the rule."""
    empty = derive_single_asset(asset_row(1))
    assert empty.external_dependency == "Ne"
    assert empty.linked_vendor_count == 0
    assert empty.vendor_names == ()
    assert empty.ict_service_codes == ()
    assert empty.contract_references == ()

    linked = derive_single_asset(
        asset_row(1),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=7,
                vendor_name="BIZ DATA",
                ict_service_code="S02",
                contract_reference="SML-2020-001",
            ),
        ),
    )
    assert linked.external_dependency == "Ano"
    assert linked.linked_vendor_count == 1
    assert linked.vendor_names == ("BIZ DATA",)
    assert linked.ict_service_codes == ("S02",)
    assert linked.contract_references == ("SML-2020-001",)


def test_asset_legacy_flag_from_state_or_support_end_before_reference_date():
    """legacy = Ano if stav="Legacy" OR (konec_radne filled AND < P_RefDatum)."""
    assert derive_single_asset(asset_row(1, lifecycle_state="Legacy")).legacy == "Ano"

    before_ref = derive_single_asset(
        asset_row(1, lifecycle_state="V provozu", standard_support_end_date=date(2026, 7, 2))
    )
    assert before_ref.legacy == "Ano"  # P_RefDatum default is 2026-07-03

    on_ref = derive_single_asset(
        asset_row(1, lifecycle_state="V provozu", standard_support_end_date=date(2026, 7, 3))
    )
    assert on_ref.legacy == "Ne"  # strictly-before comparison

    assert derive_single_asset(asset_row(1, lifecycle_state="V provozu")).legacy == "Ne"

    # The reference date is a parameter: moving it moves the flag.
    moved = derive_single_asset(
        asset_row(1, standard_support_end_date=date(2026, 7, 2)),
        params=parameter_set(P_RefDatum=date(2026, 7, 1)),
    )
    assert moved.legacy == "Ne"
    assert moved.inputs.reference_date == date(2026, 7, 1)


def test_asset_linked_asset_names_list_the_assets_this_one_depends_on():
    """vazby_aktiv — the workbook builder formula, verbatim (sheets_core.py:388-389):

    ``=TEXTJOIN(", ",TRUE,IF(06!B=$A{r},06!E,""))``

    06!B is the DEPENDENT asset id and 06!E the SUPPORTING asset name — the
    list is single-direction: the assets this asset depends on. A link where
    this asset is the supporting end contributes nothing.
    """
    derived = derive_single_asset(
        asset_row(1),
        extra_assets=(asset_row(2), asset_row(3)),
        asset_asset_links=(
            AssetAssetLinkInput(dependent_asset_id=1, supporting_asset_id=2),
            AssetAssetLinkInput(dependent_asset_id=3, supporting_asset_id=1),
        ),
    )
    assert derived.linked_asset_names == ("Aktivum 2",)


def test_asset_score_banding_shifts_with_parameter_overlay():
    """Raising P_AktVysoka through the parameter set reclassifies the score."""
    row = asset_row(
        1,
        confidentiality_rating=5,
        integrity_rating=5,
        availability_rating=5,
        authenticity_rating=5,
        impact_client=5,
        impact_regulatory=5,
        substitutability_rating=5,
        vendor_dependency_rating=4,
    )
    assert derive_single_asset(row).score_criticality == "Kritická"  # 4.95 > 4

    shifted = derive_single_asset(row, params=parameter_set(P_AktVysoka=5))
    assert shifted.weighted_score == 4.95
    assert shifted.score_criticality == "Vysoká"  # 4.95 <= 5 now
    assert shifted.inputs.threshold_high_score == 5


# ===========================================================================
# Seam 2 — HTTP via client_factory: derived blocks ride the Read payloads.
# ===========================================================================


async def _create_via_api(client, path: str, payload: dict[str, object]) -> dict[str, object]:
    response = await client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_process_read_payloads_carry_the_derived_block(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Provoz a služby klientům",
                "l1_process": "Správa pojistných smluv",
                "owner": "Provozní úsek",
                "impact_client": 4,
                "impact_market_operations": 4,
                "impact_regulatory": 4,
                "impact_financial": 4,
                "impact_reputational": 1,
                "mtpd_hours": 4,
                "rto_hours": 8,
                "rpo_hours": 4,
                "bcm_link": "Ano",
                "interruption_impact": "Vysoký",
                "assessment_date": "2026-06-01",
            },
        )
        asset = await _create_via_api(client, "/api/v1/assets", {"name": "Veris"})
        link = await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={"process_id": process["id"], "is_primary": True},
        )
        assert link.status_code == 201, link.text

        detail = await client.get(f"/api/v1/processes/{process['id']}")
        assert detail.status_code == 200
        derived = detail.json()["derived"]

        # Workbook literals (spec 2.1): score 16 + bonus 5, class Kritická.
        assert derived["criticality_score"] == 21
        assert derived["criticality_class"] == "Kritická"
        assert derived["cif"] == "Ano"
        assert derived["rto_mtpd_check"] == "GAP: RTO > MTPD"  # 8 > 4
        assert derived["bcm_check"] == "OK"
        assert derived["next_review_date"] == "2027-06-01"
        assert derived["linked_asset_count"] == 1
        assert derived["linked_vendor_count"] == 0
        assert derived["is_complete"] is True
        assert derived["is_duplicate"] is False

        # The explain block exposes the inputs that produced the values.
        inputs = derived["inputs"]
        assert inputs["mtpd_bonus"] == 5
        assert inputs["threshold_critical_score"] == 16
        assert inputs["criticality_class_source"] == "score"
        assert inputs["cif_class_critical"] is True
        assert inputs["missing_for_completeness"] == []

        # The list payload carries the same derived block per row.
        listing = await client.get("/api/v1/processes", params={"search": "Správa pojistných smluv"})
        assert listing.status_code == 200
        [row] = [item for item in listing.json()["items"] if item["id"] == process["id"]]
        assert row["derived"]["criticality_class"] == "Kritická"
        assert row["derived"]["cif"] == "Ano"


@pytest.mark.asyncio
async def test_process_derived_block_recomputes_on_read(client_factory, test_user_cro: User):
    """Compute-on-read: an input change moves the derived block immediately."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Finance",
                "l1_process": "Regulatorní reporting",
                "impact_client": 4,
                "impact_market_operations": 4,
                "impact_regulatory": 4,
                "impact_financial": 4,
                "mtpd_hours": 25,
            },
        )
        assert process["derived"]["criticality_score"] == 17
        assert process["derived"]["criticality_class"] == "Kritická"

        updated = await client.patch(f"/api/v1/processes/{process['id']}", json={"impact_client": 1})
        assert updated.status_code == 200
        assert updated.json()["derived"]["criticality_score"] == 14
        assert updated.json()["derived"]["criticality_class"] == "Vysoká"


@pytest.mark.asyncio
async def test_process_reputational_impact_stays_outside_score_and_cif(client_factory, test_user_cro: User):
    """d_rep is entered but read by no formula (spec section 8 item 10)."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Marketing",
                "l1_process": "Kampaně",
                "impact_client": 1,
                "impact_market_operations": 1,
                "impact_regulatory": 1,
                "impact_financial": 1,
                "impact_reputational": 5,
                "mtpd_hours": 25,
            },
        )
        derived = process["derived"]
        assert derived["criticality_score"] == 5  # 4 + default bonus; the 5 never summed
        assert derived["criticality_class"] == "Nízká"
        assert derived["cif"] == "Ne"  # the reputational 5 is not a CIF axis


@pytest.mark.asyncio
async def test_asset_read_payloads_carry_the_derived_block_with_explain(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        cif_process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Prodej a distribuce",
                "l1_process": "Sjednání pojištění",
                "l2_subprocess": "Online",
                "impact_client": 5,
                "impact_market_operations": 4,
                "impact_regulatory": 4,
                "impact_financial": 4,
                "mtpd_hours": 4,
                "rto_hours": 6,
            },
        )
        low_process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Podpůrné funkce",
                "l1_process": "Interní podpora",
                "impact_client": 1,
                "impact_market_operations": 1,
                "impact_regulatory": 1,
                "impact_financial": 1,
                "mtpd_hours": 100,
            },
        )
        asset = await _create_via_api(
            client,
            "/api/v1/assets",
            {
                "name": "Veris",
                "confidentiality_rating": 5,
                "integrity_rating": 5,
                "availability_rating": 5,
                "authenticity_rating": 5,
                "impact_client": 5,
                "impact_regulatory": 5,
                "substitutability_rating": 5,
                "vendor_dependency_rating": 4,
                "preliminary_criticality": "Kritická",
                "lifecycle_state": "V provozu",
            },
        )
        # A fresh asset already carries its derived block (empty-links shape).
        assert asset["derived"]["cif"] == "Ne"
        assert asset["derived"]["linked_process_count"] == 0

        for payload in (
            {"process_id": cif_process["id"], "is_primary": True, "spof": "Ano"},
            {"process_id": low_process["id"]},
        ):
            response = await client.post(f"/api/v1/assets/{asset['id']}/process-links", json=payload)
            assert response.status_code == 201, response.text

        detail = await client.get(f"/api/v1/assets/{asset['id']}")
        assert detail.status_code == 200
        derived = detail.json()["derived"]

        # The spec 2.5 worked example, end to end over HTTP.
        assert derived["ciaa_value"] == 5
        assert derived["weighted_score"] == 4.95
        assert derived["score_criticality"] == "Kritická"
        assert derived["business_criticality"] == "Kritická"
        assert derived["h_rank"] == 4
        assert derived["resulting_criticality"] == "Kritická"
        assert derived["article8_classification"] == "Kritické"
        assert derived["cif"] == "Ano"
        assert derived["cif_process_count"] == 1
        assert derived["cif_process_names"] == ["Sjednání pojištění – Online"]
        assert derived["spof"] == "Ano"
        assert derived["external_dependency"] == "Ne"  # Asset<->Vendor links arrive with #46
        assert derived["legacy"] == "Ne"
        assert derived["linked_process_count"] == 2
        assert derived["linked_vendor_count"] == 0
        assert derived["vendor_names"] == []
        assert derived["ict_service_codes"] == []
        assert derived["contract_references"] == []

        # Primary-process lookups inherit from the ONE designated primary.
        assert derived["primary_process_name"] == "Sjednání pojištění – Online"
        assert derived["primary_process_criticality"] == "Kritická"
        assert derived["inherited_impact_operations"] == 4
        assert derived["inherited_impact_financial"] == 4
        assert derived["inherited_rto_hours"] == 6

        # The explain block carries the five h_rank signals.
        inputs = derived["inputs"]
        assert inputs["primary_process_id"] == cif_process["id"]
        assert inputs["rank_primary_process_criticality"] == 4
        assert inputs["rank_score_criticality"] == 4
        assert inputs["rank_preliminary_criticality"] == 4
        assert inputs["rank_business_criticality"] == 4
        assert inputs["rank_cif_floor"] == 2

        # The list payload carries the same derived block per row.
        listing = await client.get("/api/v1/assets", params={"search": "Veris"})
        assert listing.status_code == 200
        [row] = [item for item in listing.json()["items"] if item["id"] == asset["id"]]
        assert row["derived"]["resulting_criticality"] == "Kritická"
        assert row["derived"]["cif"] == "Ano"
        assert row["primary_process_id"] == cif_process["id"]


@pytest.mark.asyncio
async def test_derived_fields_stay_rejected_on_write(client_factory, test_user_cro: User):
    """AC: the API rejects writes that include derived fields (both entities)."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_via_api(
            client, "/api/v1/processes", {"l0_area": "Provoz", "l1_process": "Proces bez odvozenin"}
        )
        asset = await _create_via_api(client, "/api/v1/assets", {"name": "Aktivum bez odvozenin"})

        process_writes = [
            {"l0_area": "Provoz", "l1_process": "X", "derived": {"cif": "Ano"}},
            {"l0_area": "Provoz", "l1_process": "X", "criticality_score": 25},
            {"l0_area": "Provoz", "l1_process": "X", "cif": "Ano"},
        ]
        for payload in process_writes:
            assert (await client.post("/api/v1/processes", json=payload)).status_code == 422
        assert (
            await client.patch(f"/api/v1/processes/{process['id']}", json={"criticality_class": "Nízká"})
        ).status_code == 422

        asset_writes = [
            {"name": "X", "derived": {"resulting_criticality": "Nízká"}},
            {"name": "X", "resulting_criticality": "Nízká"},
            {"name": "X", "weighted_score": 1.0},
        ]
        for payload in asset_writes:
            assert (await client.post("/api/v1/assets", json=payload)).status_code == 422
        assert (
            await client.patch(f"/api/v1/assets/{asset['id']}", json={"h_rank": 4})
        ).status_code == 422


@pytest.mark.asyncio
async def test_parameter_overlay_shifts_the_derived_class_over_http(
    client_factory, db_session, test_user_cro: User
):
    """The engine reads the seeded parameter set: an ADR-008 config row moves
    the banding edge for every read (precedent: test_ict_register_reference)."""
    from app.models import GlobalConfig

    async with client_factory(user=test_user_cro) as client:
        process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Finance",
                "l1_process": "Uzávěrka",
                "impact_client": 4,
                "impact_market_operations": 4,
                "impact_regulatory": 4,
                "impact_financial": 4,
                "mtpd_hours": 25,
            },
        )
        assert process["derived"]["criticality_score"] == 17
        assert process["derived"]["criticality_class"] == "Kritická"

        db_session.add(
            GlobalConfig(
                key="ict_register_krit_skore",
                value="18",
                value_type="int",
                category="ict_register_parameters",
                display_name="P_KritSkore",
                is_editable=False,
            )
        )
        await db_session.commit()
        clear_config_cache()

        shifted = await client.get(f"/api/v1/processes/{process['id']}")
        assert shifted.status_code == 200
        derived = shifted.json()["derived"]
        assert derived["criticality_score"] == 17
        assert derived["criticality_class"] == "Vysoká"
        assert derived["inputs"]["threshold_critical_score"] == 18
