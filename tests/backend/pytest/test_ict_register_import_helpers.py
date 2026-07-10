"""Characterization tests for the ICT Register cutover-import helpers (issue #53).

Pins the PURE mapping logic in ``scripts._ict_register_import_helpers`` with
inline fixtures only — no database, no network, and NEVER the external
workbook (CI must stay green without it). The workbook-scale numbers used
here are copied literals from the functional spec
(docs/dora-ict-register/dora-excel-functional-spec.md §6: P_RizStr=15,
P_RizVys=40, P_RizKrit=80, P_Tolerance=39 on the 1-125 three-factor scale).
"""

from __future__ import annotations

import pytest

from scripts._ict_register_import_helpers import (
    LICENSED_ACTIVITY_NON_LIFE,
    LICENSED_ACTIVITY_SUPPORT,
    RiskBandScale,
    asset_preliminary_criticality,
    excel_round,
    factor_score_for_app,
    get_column_letter,
    join_aliases,
    licensed_activity_for_l0,
    normalize_l2,
    scale_risk_band_thresholds,
    workbook_risk_scores,
    workbook_subject_value,
)

# The workbook parameter defaults (spec §6) and their fixed scale bounds.
WORKBOOK_SCALE = RiskBandScale(medium_from=15, high_from=40, critical_from=80, tolerance=39)
WORKBOOK_MAX = 125  # hodnota_subjektu (<=5) x zranitelnost (<=5) x pravděpodobnost (<=5)
APP_MAX = 25  # probability (<=5) x impact (<=5)
APP_SCALE = RiskBandScale(medium_from=3, high_from=8, critical_from=16, tolerance=7)


class TestExcelRound:
    """Excel ROUND(x,0) rounds half AWAY from zero; Python round() is banker's."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (18.0, 18),
            (12.6, 13),
            (22.5, 23),  # Python round(22.5) == 22 — the divergence that matters
            (0.5, 1),
            (2.4, 2),
            (48.0, 48),
        ],
    )
    def test_rounds_half_away_from_zero(self, value: float, expected: int) -> None:
        assert excel_round(value) == expected


class TestColumnLetterStub:
    """The openpyxl.utils stub must match openpyxl semantics for the builder import."""

    @pytest.mark.parametrize(
        ("index", "letter"), [(1, "A"), (2, "B"), (26, "Z"), (27, "AA"), (52, "AZ"), (53, "BA"), (703, "AAA")]
    )
    def test_matches_openpyxl_semantics(self, index: int, letter: str) -> None:
        assert get_column_letter(index) == letter

    def test_rejects_non_positive_index(self) -> None:
        with pytest.raises(ValueError):
            get_column_letter(0)


class TestSmallMappers:
    def test_normalize_l2_blanks_become_null(self) -> None:
        assert normalize_l2("") is None
        assert normalize_l2(None) is None
        assert normalize_l2("FNOL triage") == "FNOL triage"

    def test_join_aliases(self) -> None:
        assert join_aliases([]) is None
        assert join_aliases(None) is None
        assert join_aliases(["CCS", "Core Claims"]) == "CCS; Core Claims"

    def test_licensed_activity_rule_is_the_builders_verbatim(self) -> None:
        # Support-function areas (builder sheets_core.py:225-231).
        assert licensed_activity_for_l0("IT provoz a bezpečnost") == LICENSED_ACTIVITY_SUPPORT
        assert licensed_activity_for_l0("Finance a účetnictví") == LICENSED_ACTIVITY_SUPPORT
        assert licensed_activity_for_l0("Řízení dodavatelů a outsourcingu") == LICENSED_ACTIVITY_SUPPORT
        # Everything else is non-life — INCLUDING the rule/data spelling
        # mismatches the workbook shipped with (fidelity over cleanup).
        assert licensed_activity_for_l0("Likvidace škod") == LICENSED_ACTIVITY_NON_LIFE
        assert licensed_activity_for_l0("BCM, DR, krizové řízení a dostupnost") == LICENSED_ACTIVITY_NON_LIFE
        assert licensed_activity_for_l0("Regulatorní reporting") == LICENSED_ACTIVITY_NON_LIFE

    def test_asset_preliminary_criticality_bia_wins_then_source_class(self) -> None:
        bia_map = {1: "Nízká", 3: "Vysoká", 4: "Kritická"}
        assert asset_preliminary_criticality(4, "Nízká", bia_map) == "Kritická"
        assert asset_preliminary_criticality(3, "", bia_map) == "Vysoká"
        assert asset_preliminary_criticality(None, "Kritická", bia_map) == "Kritická"
        assert asset_preliminary_criticality(None, "", bia_map) is None
        # An unmapped BIA aggregate falls through to the source class (builder `or`).
        assert asset_preliminary_criticality(2, "Nízká", bia_map) == "Nízká"


class TestWorkbookSubjectValue:
    """13_Rizika 'Hodnota subjektu' formula, verbatim (sheets_vendors.py:653-656)."""

    @pytest.mark.parametrize(
        ("subject_type", "label", "expected"),
        [
            ("Dodavatel", "Kritický dodavatel", 5),
            ("Dodavatel", "Významný dodavatel", 4),
            ("Dodavatel", "Standardní dodavatel", 2),
            ("Aktivum", "Kritická", 5),
            ("Aktivum", "Vysoká", 4),
            ("Proces", "Střední", 3),
            ("Proces", "Nízká", 2),
            ("Proces", None, None),  # blank derived class -> blank value
            ("Aktivum", "nesmysl", None),  # MATCH miss -> IFERROR blank
        ],
    )
    def test_subject_values(self, subject_type: str, label: str | None, expected: int | None) -> None:
        assert workbook_subject_value(subject_type, label) == expected


class TestWorkbookRiskScores:
    """hrubé/čisté formulas verbatim, including the Excel half-away rounding."""

    def test_gross_is_three_factor_product(self) -> None:
        assert workbook_risk_scores(5, 3, 3, None) == (45, 45)

    def test_net_applies_effectiveness_with_excel_rounding(self) -> None:
        # 5x3x3=45, x0.4 = 18.0
        assert workbook_risk_scores(5, 3, 3, 0.6) == (45, 18)
        # 5x3x3=45, x0.5 = 22.5 -> Excel 23 (Python round would give 22)
        assert workbook_risk_scores(5, 3, 3, 0.5) == (45, 23)
        # 5x4x3=60, x0.8 = 48 — the workbook's accepted-above-tolerance risk
        assert workbook_risk_scores(5, 4, 3, 0.2) == (60, 48)
        # 2x3x3=18, x0.7 = 12.6 -> 13
        assert workbook_risk_scores(2, 3, 3, 0.3) == (18, 13)


class TestScaleRiskBandThresholds:
    def test_proportional_cutover_of_the_spec_defaults(self) -> None:
        scaled = scale_risk_band_thresholds(
            WORKBOOK_SCALE, workbook_scale_max=WORKBOOK_MAX, app_scale_max=APP_MAX
        )
        # 15/40/80 on 125 are exactly 3/8/16 on 25 (factor 1/5).
        assert scaled == APP_SCALE

    def test_tolerance_floors_because_it_is_a_ceiling(self) -> None:
        # 39/5 = 7.8: rounding UP to 8 would admit the scaled Vysoké floor
        # (8 <=> workbook 40, which the workbook flags NAD TOLERANCI).
        scaled = scale_risk_band_thresholds(
            WORKBOOK_SCALE, workbook_scale_max=WORKBOOK_MAX, app_scale_max=APP_MAX
        )
        assert scaled.tolerance == 7
        assert scaled.tolerance == scaled.high_from - 1  # "within <=> below Vysoké" preserved

    def test_non_integer_band_floor_is_a_hard_error(self) -> None:
        # A floor that does not scale exactly must abort, never shift silently.
        with pytest.raises(ValueError, match="does not scale to an integer"):
            scale_risk_band_thresholds(
                RiskBandScale(medium_from=14, high_from=40, critical_from=80, tolerance=39),
                workbook_scale_max=WORKBOOK_MAX,
                app_scale_max=APP_MAX,
            )


class TestFactorScoreForApp:
    """Band + tolerance preservation while factoring onto two 1-5 axes."""

    def _factor(self, workbook_score: int, preferred: int, enforce_tolerance: bool = True) -> tuple[int, int]:
        return factor_score_for_app(
            workbook_score,
            workbook_scale=WORKBOOK_SCALE,
            app_scale=APP_SCALE,
            workbook_scale_max=WORKBOOK_MAX,
            app_scale_max=APP_MAX,
            preferred_probability=preferred,
            enforce_tolerance=enforce_tolerance,
        )

    @pytest.mark.parametrize(
        ("workbook_score", "preferred", "expected_pair"),
        [
            # The workbook's actual seeded risks (spec §7.4 rows), pre-computed:
            (45, 3, (3, 3)),  # RIZ-001 gross: Vysoké, target 9 -> exact
            (18, 3, (3, 1)),  # RIZ-001 net: Střední, target 3.6 -> prob kept, product 3
            (80, 4, (4, 4)),  # RIZ-002 gross: Kritické, target 16 -> exact
            (40, 4, (4, 2)),  # RIZ-002 net: Vysoké + NAD TOLERANCI, target 8 -> exact
            (30, 2, (2, 3)),  # RIZ-003 gross: Střední, target 6 -> exact
            (15, 2, (2, 2)),  # RIZ-003 net: Střední, target 3 -> nearest with prob 2
            (23, 3, (3, 2)),  # RIZ-004 net: Střední, target 4.6
            (60, 3, (3, 4)),  # RIZ-007 gross: Vysoké, target 12 -> exact
            (48, 3, (3, 3)),  # RIZ-007 net: Vysoké + NAD TOLERANCI, target 9.6
            (13, 3, (2, 1)),  # RIZ-008 net: Nízké — prob 3 cannot stay in band, falls back
        ],
    )
    def test_workbook_seed_risks_factor_deterministically(
        self, workbook_score: int, preferred: int, expected_pair: tuple[int, int]
    ) -> None:
        assert self._factor(workbook_score, preferred) == expected_pair

    @pytest.mark.parametrize(
        ("workbook_score", "preferred"),
        [(45, 3), (18, 3), (80, 4), (40, 4), (30, 2), (15, 2), (23, 3), (60, 3), (48, 3), (13, 3), (20, 2)],
    )
    def test_band_is_always_preserved(self, workbook_score: int, preferred: int) -> None:
        from app.services._ict_register_lifecycle.dq import risk_net_band, risk_vs_tolerance

        probability, impact = self._factor(workbook_score, preferred)
        app_score = probability * impact
        assert risk_net_band(
            app_score,
            medium_from=APP_SCALE.medium_from,
            high_from=APP_SCALE.high_from,
            critical_from=APP_SCALE.critical_from,
        ) == risk_net_band(
            workbook_score,
            medium_from=WORKBOOK_SCALE.medium_from,
            high_from=WORKBOOK_SCALE.high_from,
            critical_from=WORKBOOK_SCALE.critical_from,
        )
        assert risk_vs_tolerance(app_score, tolerance=APP_SCALE.tolerance) == risk_vs_tolerance(
            workbook_score, tolerance=WORKBOOK_SCALE.tolerance
        )

    def test_tolerance_verdict_boundary_pair(self) -> None:
        # Workbook 39 (within, top of tolerance) vs 40 (NAD) must land on
        # opposite sides of the scaled ceiling 7.
        within_probability, within_impact = self._factor(39, 5)
        over_probability, over_impact = self._factor(40, 5)
        assert within_probability * within_impact <= APP_SCALE.tolerance
        assert over_probability * over_impact > APP_SCALE.tolerance

    def test_blank_score_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="cannot be factored"):
            factor_score_for_app(
                None,
                workbook_scale=WORKBOOK_SCALE,
                app_scale=APP_SCALE,
                workbook_scale_max=WORKBOOK_MAX,
                app_scale_max=APP_MAX,
                preferred_probability=3,
                enforce_tolerance=True,
            )

    def test_unsatisfiable_band_tolerance_combination_is_a_hard_error(self) -> None:
        # A pathological scaled tolerance sitting ON TOP of the Vysoké band
        # (15) leaves no product that is both Vysoké (8-15) and above
        # tolerance — the factoring must fail loudly, never fudge the band.
        pathological = RiskBandScale(medium_from=3, high_from=8, critical_from=16, tolerance=15)
        with pytest.raises(ValueError, match="No 1-5"):
            factor_score_for_app(
                40,
                workbook_scale=WORKBOOK_SCALE,
                app_scale=pathological,
                workbook_scale_max=WORKBOOK_MAX,
                app_scale_max=APP_MAX,
                preferred_probability=4,
                enforce_tolerance=True,
            )
