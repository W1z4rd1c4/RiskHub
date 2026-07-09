"""The 23 workbook parameters — a seeded, versioned parameter set (ADR-008 style).

Source of truth for names, defaults, and meanings:
docs/dora-ict-register/dora-excel-functional-spec.md section 6 (``PARAMS``,
``PARAM_TXT``, ``PARAM_DATE``). In the workbook every parameter is an
Excel-defined-name read live by formulas; here each parameter follows the
ADR-008 risk-threshold pattern instead: the verbatim workbook default lives in
code and a seeded ``global_config`` row (category ``ict_register_parameters``)
is authoritative when present. The set is versioned by the methodology version
parameter ``P_Verze``.

Later ICT Register slices (the derivation engine above all) read parameters via
:func:`load_ict_workbook_parameter_set`, never from scattered constants.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from typing import TYPE_CHECKING, Literal

from app.core.exceptions import NotFoundError
from app.services._config.lookup import get_config_value

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

IctParameterValue = int | str | date
IctParameterValueType = Literal["int", "string", "date"]

ICT_PARAMETER_CONFIG_CATEGORY = "ict_register_parameters"


@dataclass(frozen=True)
class IctWorkbookParameter:
    """One named workbook parameter with its verbatim default."""

    name: str
    config_key: str
    value_type: IctParameterValueType
    default: IctParameterValue
    meaning: str


def _parameter(
    name: str,
    key_suffix: str,
    value_type: IctParameterValueType,
    default: IctParameterValue,
    meaning: str,
) -> IctWorkbookParameter:
    return IctWorkbookParameter(
        name=name,
        config_key=f"ict_register_{key_suffix}",
        value_type=value_type,
        default=default,
        meaning=meaning,
    )


# All 23 workbook parameters, verbatim defaults, in spec order (section 6).
ICT_WORKBOOK_PARAMETERS: tuple[IctWorkbookParameter, ...] = (
    _parameter("P_KritSkore", "krit_skore", "int", 16, 'Process class "Kritická": score >='),
    _parameter("P_VysSkore", "vys_skore", "int", 12, 'Process class "Vysoká": score >='),
    _parameter("P_StrSkore", "str_skore", "int", 8, 'Process class "Střední": score >='),
    _parameter("P_MTPDKrit", "mtpd_krit", "int", 4, "MTPD (h) <= for critical speed-bonus"),
    _parameter("P_MTPDStr", "mtpd_str", "int", 24, "MTPD (h) <= for medium speed-bonus"),
    _parameter("P_BonusKrit", "bonus_krit", "int", 5, "MTPD bonus, critical"),
    _parameter("P_BonusStr", "bonus_str", "int", 3, "MTPD bonus, medium"),
    _parameter("P_BonusDef", "bonus_def", "int", 1, "MTPD bonus, default"),
    _parameter("P_AktNizka", "akt_nizka", "int", 2, "Asset score <= for Nízká"),
    _parameter("P_AktStredni", "akt_stredni", "int", 3, "Asset score <= for Střední"),
    _parameter("P_AktVysoka", "akt_vysoka", "int", 4, "Asset score <= for Vysoká (else Kritická)"),
    _parameter("P_RizStr", "riz_str", "int", 15, "Risk band Střední from (gross/net >=)"),
    _parameter("P_RizVys", "riz_vys", "int", 40, "Risk band Vysoké from"),
    _parameter("P_RizKrit", "riz_krit", "int", 80, "Risk band Kritické from"),
    _parameter(
        "P_Tolerance",
        "tolerance",
        "int",
        39,
        "Net-risk tolerance ceiling (default; board approval per DORA art. 6(8)(b))",
    ),
    _parameter("P_VKProc", "vk_proc", "int", 4, "Materiality: equity-capital impact > (%), documentary only"),
    _parameter("P_Vypadek", "vypadek", "int", 24, "Materiality: outage > (h), documentary only"),
    _parameter("P_GdprMinC", "gdpr_min_c", "int", 3, "GDPR asset: minimum confidentiality (C) >="),
    _parameter("P_Verze", "verze", "string", "1.0", "Methodology version"),
    _parameter("P_Entita", "entita", "string", "Slavia pojišťovna a.s.", "Entity legal name"),
    _parameter("P_LEI", "lei", "string", "LEI-DOPLNIT", "Entity LEI (placeholder until filled)"),
    _parameter("P_RefDatum", "ref_datum", "date", date(2026, 7, 3), "Reference date for EOL/deadline checks"),
    _parameter("P_RoIDatum", "roi_datum", "date", date(2026, 12, 31), "RoI as-of date"),
)

ICT_WORKBOOK_PARAMETERS_BY_NAME: Mapping[str, IctWorkbookParameter] = {
    parameter.name: parameter for parameter in ICT_WORKBOOK_PARAMETERS
}

_VERSION_PARAMETER_NAME = "P_Verze"


@dataclass(frozen=True)
class IctWorkbookParameterSet:
    """Effective values of all 23 workbook parameters, plus the set version."""

    version: str
    values: Mapping[str, IctParameterValue]

    def value(self, name: str) -> IctParameterValue:
        """Return one effective parameter value by its workbook name."""
        try:
            return self.values[name]
        except KeyError:
            raise NotFoundError(f"Unknown ICT Register workbook parameter '{name}'") from None


def _coerce_effective_value(parameter: IctWorkbookParameter, raw: object) -> IctParameterValue:
    """Coerce a configured value to the parameter type; fall back to the default.

    Mirrors ``get_config_int`` semantics from ADR-008: an unparseable stored
    value never breaks reads, it yields the verbatim workbook default.
    """
    if parameter.value_type == "int":
        try:
            return int(raw)  # type: ignore[call-overload]
        except (TypeError, ValueError):
            return parameter.default
    if parameter.value_type == "date":
        if isinstance(raw, date):
            return raw
        try:
            return date.fromisoformat(str(raw))
        except ValueError:
            return parameter.default
    return str(raw)


async def load_ict_workbook_parameter_set(db: "AsyncSession") -> IctWorkbookParameterSet:
    """Load the effective, versioned workbook parameter set.

    Every parameter reads its seeded ``global_config`` row when present and the
    verbatim workbook default otherwise, following the ADR-008 threshold SSOT.
    """
    values: dict[str, IctParameterValue] = {}
    for parameter in ICT_WORKBOOK_PARAMETERS:
        raw = await get_config_value(db, parameter.config_key, parameter.default)
        values[parameter.name] = _coerce_effective_value(parameter, raw)

    version = values[_VERSION_PARAMETER_NAME]
    return IctWorkbookParameterSet(version=str(version), values=values)
