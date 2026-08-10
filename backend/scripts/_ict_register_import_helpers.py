"""Pure mapping helpers for the one-time ICT Register cutover import (issue #53).

Everything here is deterministic and side-effect free — no database, no file
reads — so the CI-safe characterization tests in
``tests/backend/pytest/test_ict_register_import_helpers.py`` can pin the logic
without the external workbook.

The load-bearing piece is the risk-score cutover: the workbook's 13_Rizika
scores live on a 1-125 scale (``hrubé = hodnota_subjektu × zranitelnost ×
pravděpodobnost``, each axis 1-5; builder ``sheets_vendors.py:663-673``) while
the app's Risk carries two-factor 1-25 scores (``net_score = net_probability ×
net_impact``, ADR-008 thresholds). The #50-documented mapping is
``ciste -> Risk.net_score``; this module derives the PROPORTIONAL band intent
(125 -> 25 is an exact /5) and factors each workbook score into a 1-5 × 1-5
pair that preserves the workbook's risk band and tolerance verdict exactly.
Banding itself is reused from the DQ engine (:func:`~app.services.
_ict_register_lifecycle.dq.risk_net_band`) — one banding SSOT, never a copy.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from itertools import product

from app.services._ict_register_lifecycle.dq import (
    RISK_OVER_TOLERANCE,
    RISK_WITHIN_TOLERANCE,
    risk_net_band,
    risk_vs_tolerance,
)

# The workbook's TridyKrit closed list, in MATCH order (builder seed.py ENUMS).
_CRITICALITY_CLASSES = ("Nízká", "Střední", "Vysoká", "Kritická")

# Vendor-subject values from the 13_Rizika hodnota_subj formula, verbatim:
# Kritický dodavatel -> 5, Významný dodavatel -> 4, anything else entered -> 2
# (builder sheets_vendors.py:653-656).
_VENDOR_SUBJECT_VALUES = {"Kritický dodavatel": 5, "Významný dodavatel": 4}
_VENDOR_SUBJECT_DEFAULT = 2

# 03_Procesy seed-time licensed-activity rule, verbatim from builder
# sheets_core.py:225-231 (the L0 tuple is inlined there, not in seed.py).
# NOTE the rule's L0 spellings do not all match the imported L0 areas (e.g.
# "BCM, DR a krizové řízení" vs the data's "BCM, DR, krizové řízení a
# dostupnost") — the workbook shipped with that outcome, so the import
# reproduces it; only 3 areas resolve to "Podpůrné funkce" under the data.
_SUPPORT_FUNCTION_L0_AREAS = frozenset(
    {
        "IT provoz a bezpečnost",
        "Data, integrace a reporting",
        "Řízení dodavatelů a outsourcingu",
        "BCM, DR a krizové řízení",
        "HR, právní agenda a interní služby",
        "Finance a účetnictví",
        "Regulatorní reporting a compliance",
    }
)
LICENSED_ACTIVITY_SUPPORT = "Podpůrné funkce"
LICENSED_ACTIVITY_NON_LIFE = "Neživotní pojištění"


@dataclass(frozen=True)
class RiskBandScale:
    """One risk-band parameter set: the three band floors plus the tolerance ceiling."""

    medium_from: int
    high_from: int
    critical_from: int
    tolerance: int


def excel_round(value: float | Fraction) -> int:
    """Excel ``ROUND(x, 0)``: round half AWAY from zero (not banker's rounding).

    The workbook's čisté formula is ``ROUND(hrubé*(1-účinnost),0)``
    (sheets_vendors.py:671-673); Python's built-in ``round`` would turn
    22.5 into 22 where Excel yields 23.
    """
    if isinstance(value, Fraction):
        value = Decimal(value.numerator) / Decimal(value.denominator)
    else:
        value = Decimal(str(value))
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def get_column_letter(index: int) -> str:
    """Minimal openpyxl-compatible column letter (1 -> A, 27 -> AA).

    Used solely to stub ``openpyxl.utils`` when importing the external
    builder's ``seed.py`` data module — openpyxl itself is banned from the
    runtime environment and must never be installed for the import.
    """
    if index < 1:
        raise ValueError(f"Column index must be >= 1, got {index}")
    letters = ""
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        letters = chr(ord("A") + remainder) + letters
    return letters


def normalize_l2(l2_subprocess: str | None) -> str | None:
    """Workbook L2 cells are empty strings when absent; the app stores NULL."""
    return l2_subprocess if l2_subprocess else None


def join_aliases(aliases: list[str] | tuple[str, ...] | None) -> str | None:
    """04_Aktiva alternative names: '; '-joined, exactly as the builder seeds them."""
    if not aliases:
        return None
    return "; ".join(aliases)


def licensed_activity_for_l0(l0_area: str) -> str:
    """The builder's seed-time licensed-activity prefill for a Process L0 area."""
    if l0_area in _SUPPORT_FUNCTION_L0_AREAS:
        return LICENSED_ACTIVITY_SUPPORT
    return LICENSED_ACTIVITY_NON_LIFE


def asset_preliminary_criticality(
    bia_crit: int | None,
    src_class: str | None,
    bia_map: dict[int, str],
) -> str | None:
    """04_Aktiva 'Předběžná kritičnost' input cell: BIA aggregate wins, else source class.

    Verbatim builder rule (sheets_core.py:451-453):
    ``BIA_CRIT_TO_TRIDA.get(a.get("bia_crit")) or a["src_class"]`` — with the
    workbook's empty-string fallthrough normalised to ``None``.
    """
    value = (bia_map.get(bia_crit) if bia_crit is not None else None) or src_class
    return value or None


def workbook_subject_value(subject_type: str, derived_label: str | None) -> int | None:
    """13_Rizika 'Hodnota subjektu' (E column), verbatim.

    - Dodavatel: Kritický dodavatel -> 5, Významný dodavatel -> 4, else 2.
    - Proces/Aktivum: MATCH(class, TridyKrit) + 1 -> Nízká 2 … Kritická 5.
    - A blank derived class yields a blank subject value (IFERROR -> "").
    """
    if derived_label is None:
        return None
    if subject_type == "Dodavatel":
        return _VENDOR_SUBJECT_VALUES.get(derived_label, _VENDOR_SUBJECT_DEFAULT)
    if derived_label not in _CRITICALITY_CLASSES:
        return None
    return _CRITICALITY_CLASSES.index(derived_label) + 2


def workbook_risk_scores(
    subject_value: int,
    vulnerability: int,
    probability: int,
    effectiveness: float | None,
) -> tuple[int, int]:
    """13_Rizika hrubé/čisté, verbatim (sheets_vendors.py:663-673).

    ``hrubé = hodnota × zranitelnost × pravděpodobnost``;
    ``čisté = ROUND(hrubé × (1 - účinnost), 0)`` (hrubé when no effectiveness).
    """
    gross = subject_value * vulnerability * probability
    if effectiveness is None:
        return gross, gross
    net = excel_round(Fraction(gross) * (1 - Fraction(str(effectiveness))))
    return gross, net


def scale_risk_band_thresholds(
    workbook: RiskBandScale,
    *,
    workbook_scale_max: int,
    app_scale_max: int,
) -> RiskBandScale:
    """Derive the app-scale band parameters from the workbook's, proportionally.

    Band FLOORS must scale to exact integers (a fractional band floor would
    silently move a boundary; with the shipped 15/40/80 on 125 -> 25 the
    factor is exactly 1/5). The tolerance is a CEILING, so it floors: the
    workbook's 39 sits just under the Vysoké floor (40), and admitting the
    scaled Vysoké floor itself (8) would flip a workbook-flagged score to
    within-tolerance. floor(39/5) = 7 preserves the invariant
    "within tolerance <=> below the Vysoké band" exactly.
    """
    factor = Fraction(app_scale_max, workbook_scale_max)
    scaled_floors = []
    for name, floor_value in (
        ("medium_from", workbook.medium_from),
        ("high_from", workbook.high_from),
        ("critical_from", workbook.critical_from),
    ):
        scaled = Fraction(floor_value) * factor
        if scaled.denominator != 1:
            raise ValueError(
                f"Workbook band floor {name}={floor_value} does not scale to an integer "
                f"with factor {factor}; the proportional cutover needs a PM decision"
            )
        scaled_floors.append(int(scaled))
    tolerance_scaled = Fraction(workbook.tolerance) * factor
    tolerance = tolerance_scaled.numerator // tolerance_scaled.denominator  # floor
    return RiskBandScale(
        medium_from=scaled_floors[0],
        high_from=scaled_floors[1],
        critical_from=scaled_floors[2],
        tolerance=tolerance,
    )


def _band(score: int, scale: RiskBandScale) -> str | None:
    return risk_net_band(
        score,
        medium_from=scale.medium_from,
        high_from=scale.high_from,
        critical_from=scale.critical_from,
    )


def factor_score_for_app(
    workbook_score: int | None,
    *,
    workbook_scale: RiskBandScale,
    app_scale: RiskBandScale,
    workbook_scale_max: int,
    app_scale_max: int,
    preferred_probability: int,
    enforce_tolerance: bool,
) -> tuple[int, int]:
    """Factor one workbook score into an app ``(probability, impact)`` 1-5 pair.

    Hard constraints (both must hold or the pair is not a candidate):
    - the app-scale band of ``probability × impact`` equals the workbook-scale
      band of ``workbook_score`` (DQ checks and the committee read bands);
    - when ``enforce_tolerance``, the tolerance verdict is preserved too.

    Among candidates, prefer keeping the workbook's entered ``pravděpodobnost``
    as the probability factor (it is the one genuinely two-factor input the
    workbook has), then the product closest to the exact proportional target,
    then the smaller product, then the smaller impact — fully deterministic.
    """
    if workbook_score is None:
        raise ValueError("workbook_score has no band; blank scores cannot be factored")
    required_band = _band(workbook_score, workbook_scale)
    if required_band is None:  # pragma: no cover - risk_net_band never blanks an int
        raise ValueError("workbook_score has no band; blank scores cannot be factored")
    required_verdict = risk_vs_tolerance(workbook_score, tolerance=workbook_scale.tolerance)
    target = Fraction(workbook_score * app_scale_max, workbook_scale_max)

    candidates: list[tuple[bool, Fraction, int, int, int]] = []
    for probability, impact in product(range(1, 6), range(1, 6)):
        score = probability * impact
        if _band(score, app_scale) != required_band:
            continue
        if enforce_tolerance:
            verdict = risk_vs_tolerance(score, tolerance=app_scale.tolerance)
            if verdict != required_verdict:
                continue
        candidates.append(
            (
                probability != preferred_probability,
                abs(Fraction(score) - target),
                score,
                impact,
                probability,
            )
        )
    if not candidates:
        raise ValueError(
            f"No 1-5 × 1-5 pair reproduces band {required_band!r} "
            f"(workbook score {workbook_score}) on the app scale"
        )
    candidates.sort()
    _, _, _, impact, probability = candidates[0]
    return probability, impact


__all__ = [
    "LICENSED_ACTIVITY_NON_LIFE",
    "LICENSED_ACTIVITY_SUPPORT",
    "RISK_OVER_TOLERANCE",
    "RISK_WITHIN_TOLERANCE",
    "RiskBandScale",
    "asset_preliminary_criticality",
    "excel_round",
    "factor_score_for_app",
    "get_column_letter",
    "join_aliases",
    "licensed_activity_for_l0",
    "normalize_l2",
    "scale_risk_band_thresholds",
    "workbook_risk_scores",
    "workbook_subject_value",
]
