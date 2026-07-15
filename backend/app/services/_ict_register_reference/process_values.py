"""Locale-independent Process controlled values and workbook import mappings.

The API and persistence layer store only these stable codes. Czech workbook
labels are accepted solely at the import boundary and are never runtime
fallback presentation values.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

PROCESS_PRELIMINARY_CRITICALITY_CODES: tuple[str, ...] = (
    "low",
    "medium",
    "high",
    "critical",
)
PROCESS_CIF_OVERRIDE_CODES: tuple[str, ...] = ("yes", "no")
PROCESS_LICENSED_ACTIVITY_CODES: tuple[str, ...] = (
    "non_life_insurance",
    "support_functions",
)
PROCESS_BCM_LINK_CODES: tuple[str, ...] = (
    "yes",
    "no",
    "not_assessed",
    "not_applicable",
)
PROCESS_DR_TEST_RESULT_CODES: tuple[str, ...] = (
    "successful",
    "qualified",
    "unsuccessful",
    "not_tested",
)
PROCESS_INTERRUPTION_IMPACT_CODES: tuple[str, ...] = (
    "low",
    "medium",
    "high",
    "not_assessed",
)

PROCESS_CONTROLLED_CODES_BY_FIELD: Mapping[str, tuple[str, ...]] = MappingProxyType(
    {
        "preliminary_criticality": PROCESS_PRELIMINARY_CRITICALITY_CODES,
        "cif_override": PROCESS_CIF_OVERRIDE_CODES,
        "licensed_activity": PROCESS_LICENSED_ACTIVITY_CODES,
        "bcm_link": PROCESS_BCM_LINK_CODES,
        "dr_test_result": PROCESS_DR_TEST_RESULT_CODES,
        "interruption_impact": PROCESS_INTERRUPTION_IMPACT_CODES,
    }
)

WORKBOOK_PROCESS_VALUE_TO_CODE_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        "preliminary_criticality": MappingProxyType(
            {
                "Nízká": "low",
                "Střední": "medium",
                "Vysoká": "high",
                "Kritická": "critical",
            }
        ),
        "cif_override": MappingProxyType({"Ano": "yes", "Ne": "no"}),
        "licensed_activity": MappingProxyType(
            {
                "Neživotní pojištění": "non_life_insurance",
                "Podpůrné funkce": "support_functions",
            }
        ),
        "bcm_link": MappingProxyType(
            {
                "Ano": "yes",
                "Ne": "no",
                "Neposouzeno": "not_assessed",
                "Nerelevantní": "not_applicable",
            }
        ),
        "dr_test_result": MappingProxyType(
            {
                "Úspěšný": "successful",
                "S výhradami": "qualified",
                "Neúspěšný": "unsuccessful",
                "Netestováno": "not_tested",
            }
        ),
        "interruption_impact": MappingProxyType(
            {
                "Nízký": "low",
                "Střední": "medium",
                "Vysoký": "high",
                "Neposouzeno": "not_assessed",
            }
        ),
    }
)

# ITS 2024/2956 B_06.01 terminology. Formal regulatory exports use this
# mapping; UI and ordinary exports localize the canonical codes separately.
PROCESS_REGULATORY_EN_VALUES_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        "licensed_activity": MappingProxyType(
            {
                "non_life_insurance": "non-life insurance activities",
                "support_functions": "support functions",
            }
        ),
        "interruption_impact": MappingProxyType(
            {
                "low": "Low",
                "medium": "Medium",
                "high": "High",
                "not_assessed": "Assessment not performed",
            }
        ),
    }
)


def process_controlled_value_code(field: str, value: str) -> str:
    """Return the canonical Process code for an import value.

    Existing codes are accepted idempotently so reset/import pipelines may be
    safely re-run. Unknown fields and labels fail closed.
    """

    try:
        codes = PROCESS_CONTROLLED_CODES_BY_FIELD[field]
        workbook_map = WORKBOOK_PROCESS_VALUE_TO_CODE_BY_FIELD[field]
    except KeyError as exc:
        raise ValueError(f"Unsupported Process controlled field: {field}") from exc
    if value in codes:
        return value
    try:
        return workbook_map[value]
    except KeyError as exc:
        raise ValueError(f"Unsupported Process {field} value: {value}") from exc


def process_regulatory_value(field: str, code: str) -> str:
    """Map a canonical Process code to mandated B_06.01 English terminology."""

    try:
        return PROCESS_REGULATORY_EN_VALUES_BY_FIELD[field][code]
    except KeyError as exc:
        raise ValueError(f"Unsupported regulatory Process {field} code: {code}") from exc
