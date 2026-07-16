"""Canonical Vendor values and explicit workbook/presentation adapters.

Vendor persistence and public API payloads use only the stable codes declared
here. Czech workbook labels are accepted only by the import adapter. Standard
exports may render an explicit ``en`` or ``cs`` label next to the code, while
formal regulatory exports use the dedicated regulatory mapping.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, is_dataclass
from types import MappingProxyType
from typing import Any, Literal

from app.services._ict_register_reference.country_categories import COUNTRY_CATEGORIES
from app.services._ict_register_reference.roi_maps import roi_en_value

VendorLocale = Literal["en", "cs"]


def _proxy(values: Mapping[str, str]) -> Mapping[str, str]:
    return MappingProxyType(dict(values))


VENDOR_CONTROLLED_CODES_BY_FIELD: Mapping[str, tuple[str, ...]] = MappingProxyType(
    {
        "vendor_type": ("ict", "outsourcing", "professional_services", "partner", "other"),
        "country": ("CZ", "SK", "DE", "AT", "NL", "PL", "GB", "US", "IE", "FR", "LU"),
        "person_type": ("legal_person", "individual_acting_in_business_capacity"),
        "identifier_type": ("LEI", "EUID", "CRN", "VAT", "PNR", "NIN"),
        "data_sensitivity": ("low", "medium", "high"),
        "replaceability": (
            "not_substitutable",
            "highly_complex",
            "medium_complexity",
            "easily_substitutable",
        ),
        "substitutability_reason": ("limited_market_alternatives", "migration_difficulties", "both"),
        "exit_plan_state": (
            "not_required",
            "required_missing",
            "draft",
            "approved",
            "tested",
            "review_required",
            "not_assessed",
        ),
        "reintegration": ("easy", "difficult", "highly_complex"),
        "service_disruption_impact": ("low", "medium", "high", "not_assessed"),
        "alternative_providers": ("yes", "no", "not_assessed"),
        "ctpp_designation": ("yes", "no", "undetermined"),
        "ex_ante_operational": ("ok", "risk", "not_applicable"),
        "ex_ante_legal": ("ok", "risk", "not_applicable"),
        "ex_ante_ict": ("ok", "risk", "not_applicable"),
        "ex_ante_reputational": ("ok", "risk", "not_applicable"),
        "ex_ante_data_confidentiality": ("ok", "risk", "not_applicable"),
        "ex_ante_data_availability": ("ok", "risk", "not_applicable"),
        "ex_ante_data_location": ("ok", "risk", "not_applicable"),
        "ex_ante_provider_location": ("ok", "risk", "not_applicable"),
        "ex_ante_ict_concentration": ("ok", "risk", "not_applicable"),
        "assessment_phase": ("ex_ante", "ongoing", "not_applicable"),
        "due_diligence_state": (
            "not_applicable",
            "not_started",
            "in_progress",
            "completed_without_reservations",
            "completed_with_reservations",
            "review_required",
            "not_assessed",
        ),
        "significance_authorization_conditions": ("yes", "no", "not_applicable"),
        "significance_regulatory_requirements": ("yes", "no", "not_applicable"),
        "significance_service_quality": ("yes", "no", "not_applicable"),
        "significance_financial_impact": ("yes", "no", "not_applicable"),
        "significance_reputation_continuity": ("yes", "no", "not_applicable"),
        "significance_cumulative_impact": ("yes", "no", "not_applicable"),
    }
)

_EX_ANTE_FIELDS = tuple(field for field in VENDOR_CONTROLLED_CODES_BY_FIELD if field.startswith("ex_ante_"))
_SIGNIFICANCE_FIELDS = tuple(field for field in VENDOR_CONTROLLED_CODES_BY_FIELD if field.startswith("significance_"))

_workbook_maps: dict[str, Mapping[str, str]] = {
    "vendor_type": _proxy(
        {
            "ict": "ict",
            "outsourcing": "outsourcing",
            "professional_services": "professional_services",
            "partner": "partner",
            "other": "other",
        }
    ),
    "country": _proxy({code: code for code in VENDOR_CONTROLLED_CODES_BY_FIELD["country"]}),
    "person_type": _proxy(
        {
            "Právnická osoba": "legal_person",
            "Fyzická osoba podnikající": "individual_acting_in_business_capacity",
        }
    ),
    "identifier_type": _proxy(
        {
            "LEI": "LEI",
            "EUID": "EUID",
            "CRN": "CRN",
            "VAT": "VAT",
            "PNR": "PNR",
            "NIN": "NIN",
            "IČO (CRN)": "CRN",
        }
    ),
    "data_sensitivity": _proxy({"Nízká": "low", "Střední": "medium", "Vysoká": "high"}),
    "replaceability": _proxy(
        {
            "Nenahraditelný": "not_substitutable",
            "Velmi obtížně nahraditelný": "highly_complex",
            "Středně obtížně nahraditelný": "medium_complexity",
            "Snadno nahraditelný": "easily_substitutable",
            "hard": "highly_complex",
            "medium": "medium_complexity",
            "easy": "easily_substitutable",
        }
    ),
    "substitutability_reason": _proxy(
        {
            "Omezená nabídka na trhu": "limited_market_alternatives",
            "Obtížná migrace": "migration_difficulties",
            "Obojí": "both",
        }
    ),
    "exit_plan_state": _proxy(
        {
            "Není vyžadován": "not_required",
            "Vyžadován – chybí": "required_missing",
            "Návrh": "draft",
            "Schválen": "approved",
            "Testován": "tested",
            "K revizi": "review_required",
            "Neposouzen": "not_assessed",
        }
    ),
    "reintegration": _proxy({"Snadná": "easy", "Obtížná": "difficult", "Velmi složitá": "highly_complex"}),
    "service_disruption_impact": _proxy(
        {"Nízký": "low", "Střední": "medium", "Vysoký": "high", "Neposouzeno": "not_assessed"}
    ),
    "alternative_providers": _proxy({"Ano": "yes", "Ne": "no", "Neposouzeno": "not_assessed"}),
    "ctpp_designation": _proxy({"Ano": "yes", "Ne": "no", "Neurčeno": "undetermined"}),
    "assessment_phase": _proxy({"Ex ante": "ex_ante", "Průběžná": "ongoing", "Nerelevantní": "not_applicable"}),
    "due_diligence_state": _proxy(
        {
            "Nerelevantní": "not_applicable",
            "Nezahájeno": "not_started",
            "Probíhá": "in_progress",
            "Dokončeno bez výhrad": "completed_without_reservations",
            "Dokončeno s výhradami": "completed_with_reservations",
            "K revizi": "review_required",
            "Neposouzeno": "not_assessed",
        }
    ),
}
for _field in _EX_ANTE_FIELDS:
    _workbook_maps[_field] = _proxy({"OK": "ok", "Riziko": "risk", "Nerelevantní": "not_applicable"})
for _field in _SIGNIFICANCE_FIELDS:
    _workbook_maps[_field] = _proxy({"Ano": "yes", "Ne": "no", "Nerelevantní": "not_applicable"})

WORKBOOK_VENDOR_VALUE_TO_CODE_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(_workbook_maps)
_IMPORT_ALIASES = frozenset({"IČO (CRN)", "hard", "medium", "easy"})
VENDOR_WORKBOOK_VALUE_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        field: _proxy({code: label for label, code in values.items() if label not in _IMPORT_ALIASES})
        for field, values in WORKBOOK_VENDOR_VALUE_TO_CODE_BY_FIELD.items()
    }
)

_labels_en: dict[str, Mapping[str, str]] = {
    "vendor_type": _proxy(
        {
            "ict": "ICT provider",
            "outsourcing": "Outsourcing provider",
            "professional_services": "Professional services",
            "partner": "Partner",
            "other": "Other",
        }
    ),
    "country": _proxy(
        {
            "CZ": "Czechia",
            "SK": "Slovakia",
            "DE": "Germany",
            "AT": "Austria",
            "NL": "Netherlands",
            "PL": "Poland",
            "GB": "United Kingdom",
            "US": "United States",
            "IE": "Ireland",
            "FR": "France",
            "LU": "Luxembourg",
        }
    ),
    "person_type": _proxy(
        {
            "legal_person": "Legal person",
            "individual_acting_in_business_capacity": "Individual acting in a business capacity",
        }
    ),
    "identifier_type": _proxy({code: code for code in VENDOR_CONTROLLED_CODES_BY_FIELD["identifier_type"]}),
    "data_sensitivity": _proxy({"low": "Low", "medium": "Medium", "high": "High"}),
    "replaceability": _proxy(
        {
            "not_substitutable": "Not substitutable",
            "highly_complex": "Highly complex substitutability",
            "medium_complexity": "Medium complexity of substitutability",
            "easily_substitutable": "Easily substitutable",
        }
    ),
    "substitutability_reason": _proxy(
        {
            "limited_market_alternatives": "Limited market alternatives",
            "migration_difficulties": "Migration difficulties",
            "both": "Both",
        }
    ),
    "exit_plan_state": _proxy(
        {
            "not_required": "Not required",
            "required_missing": "Required - missing",
            "draft": "Draft",
            "approved": "Approved",
            "tested": "Tested",
            "review_required": "Review required",
            "not_assessed": "Not assessed",
        }
    ),
    "reintegration": _proxy({"easy": "Easy", "difficult": "Difficult", "highly_complex": "Highly complex"}),
    "service_disruption_impact": _proxy(
        {"low": "Low", "medium": "Medium", "high": "High", "not_assessed": "Not assessed"}
    ),
    "alternative_providers": _proxy({"yes": "Yes", "no": "No", "not_assessed": "Not assessed"}),
    "ctpp_designation": _proxy({"yes": "Yes", "no": "No", "undetermined": "Undetermined"}),
    "assessment_phase": _proxy({"ex_ante": "Ex ante", "ongoing": "Ongoing", "not_applicable": "Not applicable"}),
    "due_diligence_state": _proxy(
        {
            "not_applicable": "Not applicable",
            "not_started": "Not started",
            "in_progress": "In progress",
            "completed_without_reservations": "Completed without reservations",
            "completed_with_reservations": "Completed with reservations",
            "review_required": "Review required",
            "not_assessed": "Not assessed",
        }
    ),
}
_labels_cs: dict[str, Mapping[str, str]] = {
    field: _proxy({code: label for label, code in values.items() if label not in _IMPORT_ALIASES})
    for field, values in WORKBOOK_VENDOR_VALUE_TO_CODE_BY_FIELD.items()
}
_labels_cs["vendor_type"] = _proxy(
    {
        "ict": "Poskytovatel ICT",
        "outsourcing": "Poskytovatel outsourcingu",
        "professional_services": "Profesionální služby",
        "partner": "Partner",
        "other": "Jiný",
    }
)
_labels_cs["country"] = _proxy(
    {
        "CZ": "Česko",
        "SK": "Slovensko",
        "DE": "Německo",
        "AT": "Rakousko",
        "NL": "Nizozemsko",
        "PL": "Polsko",
        "GB": "Spojené království",
        "US": "Spojené státy",
        "IE": "Irsko",
        "FR": "Francie",
        "LU": "Lucembursko",
    }
)
for _field in _EX_ANTE_FIELDS:
    _labels_en[_field] = _proxy({"ok": "OK", "risk": "Risk", "not_applicable": "Not applicable"})
for _field in _SIGNIFICANCE_FIELDS:
    _labels_en[_field] = _proxy({"yes": "Yes", "no": "No", "not_applicable": "Not applicable"})

_derived_labels_en = {
    "country_category": {"domestic": "Domestic", "eu": "EU", "non_eu": "Non-EU", "unknown": "Unknown"},
    "cif": {"yes": "Yes", "no": "No", "unknown": "Unknown"},
    "max_criticality": {"low": "Low", "medium": "Medium", "high": "High", "critical": "Critical", "unknown": "Unknown"},
    "tier": {
        "critical": "Critical provider",
        "significant": "Significant provider",
        "standard": "Standard provider",
        "unknown": "Unknown",
    },
    "cif_chain": {"yes": "Yes", "no": "No", "unknown": "Unknown"},
    "chain_level": {"A": "Own links", "B": "Direct sub-outsourcer", "C": "Deeper sub-outsourcer"},
    "significance_outcome": {"yes": "Yes", "no": "No", "unknown": "Unknown"},
    "main_contract_arrangement_type": {
        "standalone": "Standalone arrangement",
        "overarching_master": "Overarching (master) arrangement",
        "subsequent_associated": "Subsequent or associated arrangement",
        "unknown": "Unknown",
    },
}
_derived_labels_cs = {
    "country_category": {"domestic": "ČR", "eu": "EU", "non_eu": "Mimo EU", "unknown": "Neznámé"},
    "cif": {"yes": "Ano", "no": "Ne", "unknown": "Neznámé"},
    "max_criticality": {
        "low": "Nízká",
        "medium": "Střední",
        "high": "Vysoká",
        "critical": "Kritická",
        "unknown": "Neznámé",
    },
    "tier": {
        "critical": "Kritický dodavatel",
        "significant": "Významný dodavatel",
        "standard": "Standardní dodavatel",
        "unknown": "Neznámé",
    },
    "cif_chain": {"yes": "Ano", "no": "Ne", "unknown": "Neznámé"},
    "chain_level": {"A": "Vlastní vazby", "B": "Přímý subdodavatel", "C": "Hlubší subdodavatel"},
    "significance_outcome": {"yes": "Ano", "no": "Ne", "unknown": "Neznámé"},
    "main_contract_arrangement_type": {
        "standalone": "Samostatné",
        "overarching_master": "Rámcové (master)",
        "subsequent_associated": "Navazující",
        "unknown": "Neznámé",
    },
}
for _field, _labels in _derived_labels_en.items():
    _labels_en[_field] = _proxy(_labels)
for _field, _labels in _derived_labels_cs.items():
    _labels_cs[_field] = _proxy(_labels)

VENDOR_VALUE_LABELS_BY_LOCALE: Mapping[str, Mapping[str, Mapping[str, str]]] = MappingProxyType(
    {"en": MappingProxyType(_labels_en), "cs": MappingProxyType(_labels_cs)}
)

# Derived API codes are intentionally separate from the workbook-faithful
# engine constants. The engine and DQ logic remain a regulatory computation;
# only the public Vendor projection is normalized.
VENDOR_DERIVED_WORKBOOK_TO_CODE_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        "country_category": _proxy({"ČR": "domestic", "EU": "eu", "mimo EU": "non_eu", "?": "unknown"}),
        "cif": _proxy({"Ano": "yes", "Ne": "no"}),
        "max_criticality": _proxy({"Nízká": "low", "Střední": "medium", "Vysoká": "high", "Kritická": "critical"}),
        "tier": _proxy(
            {
                "Kritický dodavatel": "critical",
                "Významný dodavatel": "significant",
                "Standardní dodavatel": "standard",
            }
        ),
        "cif_chain": _proxy({"Ano": "yes", "Ne": "no"}),
        "significance_outcome": _proxy({"Ano": "yes", "Ne": "no"}),
        "main_contract_arrangement_type": _proxy(
            {
                "Samostatné": "standalone",
                "Rámcové (master)": "overarching_master",
                "Navazující": "subsequent_associated",
            }
        ),
    }
)
VENDOR_DERIVED_CODE_TO_WORKBOOK_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        field: _proxy({code: workbook for workbook, code in values.items()})
        for field, values in VENDOR_DERIVED_WORKBOOK_TO_CODE_BY_FIELD.items()
    }
)


def vendor_controlled_value_code(field: str, value: str) -> str:
    """Return a canonical code for a runtime code or workbook/import label."""

    try:
        codes = VENDOR_CONTROLLED_CODES_BY_FIELD[field]
        workbook_map = WORKBOOK_VENDOR_VALUE_TO_CODE_BY_FIELD[field]
    except KeyError as exc:
        raise ValueError(f"Unsupported Vendor controlled field: {field}") from exc
    if value in codes:
        return value
    try:
        return workbook_map[value]
    except KeyError as exc:
        raise ValueError(f"Unsupported Vendor {field} value: {value}") from exc


def vendor_workbook_value(field: str, code: str) -> str:
    """Map a canonical code to the exact Czech workbook computation value."""

    try:
        return VENDOR_WORKBOOK_VALUE_BY_FIELD[field][code]
    except KeyError as exc:
        raise ValueError(f"Unsupported workbook Vendor {field} code: {code}") from exc


def vendor_derived_workbook_value(field: str, code: str) -> str:
    """Map a public derived code back to the workbook engine vocabulary."""

    try:
        return VENDOR_DERIVED_CODE_TO_WORKBOOK_BY_FIELD[field][code]
    except KeyError as exc:
        raise ValueError(f"Unsupported derived Vendor {field} code: {code}") from exc


def vendor_country_category_code(country: str | None) -> str:
    """Classify one ISO country through the canonical workbook reference."""
    workbook_value = COUNTRY_CATEGORIES.get(country or "", "?")
    return VENDOR_DERIVED_WORKBOOK_TO_CODE_BY_FIELD["country_category"].get(
        workbook_value,
        "unknown",
    )


def vendor_value_label(field: str, code: str, *, locale: VendorLocale = "en") -> str:
    """Return an explicit localized presentation label; never fall back."""

    try:
        return VENDOR_VALUE_LABELS_BY_LOCALE[locale][field][code]
    except KeyError as exc:
        raise ValueError(f"Unsupported localized Vendor {field} code: {code} ({locale})") from exc


def vendor_regulatory_value(field: str, code: str) -> str:
    """Map a code to stable English terminology used by formal exports."""

    roi_map = {
        "person_type": "MapOsoba",
        "replaceability": "MapSubst",
        "substitutability_reason": "MapDuvod",
        "reintegration": "MapReint",
        "service_disruption_impact": "MapDopad",
        "data_sensitivity": "MapCitl",
        "alternative_providers": "MapAlt",
    }.get(field)
    if roi_map is not None:
        return roi_en_value(roi_map, vendor_workbook_value(field, code))
    if field == "exit_plan_state":
        return "Yes" if code in {"approved", "tested", "review_required"} else "No"
    return vendor_value_label(field, code, locale="en")


def canonicalize_vendor_derived(value: Any) -> dict[str, Any]:
    """Normalize one engine Vendor derivation for the public API projection."""

    raw = asdict(value) if is_dataclass(value) else dict(value)
    for field, mapping in VENDOR_DERIVED_WORKBOOK_TO_CODE_BY_FIELD.items():
        if raw.get(field) is not None:
            raw[field] = mapping.get(raw[field], "unknown")

    inputs = dict(raw.get("inputs") or {})
    input_fields = {
        "substitutability": "replaceability",
        "exit_plan_state": "exit_plan_state",
        **{field: field for field in _SIGNIFICANCE_FIELDS},
    }
    for input_name, controlled_field in input_fields.items():
        input_value = inputs.get(input_name)
        if input_value is not None:
            inputs[input_name] = vendor_controlled_value_code(controlled_field, input_value)
    raw["inputs"] = inputs

    for link in raw.get("transitive_process_links", ()):
        if link.get("process_cif") is not None:
            link["process_cif"] = {"Ano": "yes", "Ne": "no"}.get(link["process_cif"], "unknown")
        if link.get("process_criticality") is not None:
            link["process_criticality"] = {
                "Nízká": "low",
                "Střední": "medium",
                "Vysoká": "high",
                "Kritická": "critical",
            }.get(link["process_criticality"], "unknown")
    return raw
