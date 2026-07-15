"""Locale-independent Asset controlled values and workbook import mappings.

The API and persistence layer store only stable codes. Czech workbook labels
are translated only at the import boundary; runtime writes fail closed.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

ASSET_TYPE_CODES: tuple[str, ...] = (
    "application",
    "database",
    "infrastructure",
    "network_component",
    "hardware",
    "cloud_service",
    "data_storage",
    "information_asset",
    "security_asset",
    "bcm_dr_asset",
    "other",
)
ASSET_LEVEL_CODES: tuple[str, ...] = ("primary", "supporting", "infrastructure")
ASSET_DEPLOYMENT_MODEL_CODES: tuple[str, ...] = (
    "on_premise",
    "cloud",
    "saas",
    "paas",
    "iaas",
    "hybrid",
    "externally_hosted",
    "not_assessed",
    "not_applicable",
)
ASSET_RELEVANCE_CODES: tuple[str, ...] = ("yes", "no", "undetermined")
ASSET_DATA_CLASSIFICATION_CODES: tuple[str, ...] = (
    "no_data_not_applicable",
    "public",
    "internal",
    "confidential",
    "highly_confidential_regulated",
    "not_assessed",
)
ASSET_INTERNET_EXPOSED_CODES: tuple[str, ...] = ("yes", "no")
ASSET_PRELIMINARY_CRITICALITY_CODES: tuple[str, ...] = (
    "low",
    "medium",
    "high",
    "critical",
)
ASSET_LIFECYCLE_STATE_CODES: tuple[str, ...] = (
    "operational",
    "in_development",
    "being_decommissioned",
    "legacy",
    "retired",
)
ASSET_REVIEW_STATE_CODES: tuple[str, ...] = ("review_required", "reviewed")

ASSET_CONTROLLED_CODES_BY_FIELD: Mapping[str, tuple[str, ...]] = MappingProxyType(
    {
        "asset_type": ASSET_TYPE_CODES,
        "asset_level": ASSET_LEVEL_CODES,
        "deployment_model": ASSET_DEPLOYMENT_MODEL_CODES,
        "gdpr_relevance": ASSET_RELEVANCE_CODES,
        "ai_relevance": ASSET_RELEVANCE_CODES,
        "data_classification": ASSET_DATA_CLASSIFICATION_CODES,
        "internet_exposed": ASSET_INTERNET_EXPOSED_CODES,
        "preliminary_criticality": ASSET_PRELIMINARY_CRITICALITY_CODES,
        "lifecycle_state": ASSET_LIFECYCLE_STATE_CODES,
        "review_state": ASSET_REVIEW_STATE_CODES,
    }
)

WORKBOOK_ASSET_VALUE_TO_CODE_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        "asset_type": MappingProxyType(
            {
                "Aplikace": "application",
                "Databáze": "database",
                "Infrastruktura": "infrastructure",
                "Síťový prvek": "network_component",
                "Hardware": "hardware",
                "Cloud služba": "cloud_service",
                "Datové úložiště": "data_storage",
                "Informační aktivum": "information_asset",
                "Bezpečnostní aktivum": "security_asset",
                "BCM/DR aktivum": "bcm_dr_asset",
                "Jiné": "other",
            }
        ),
        "asset_level": MappingProxyType(
            {
                "A – primární": "primary",
                "B – podpůrné": "supporting",
                "C – infrastrukturní": "infrastructure",
            }
        ),
        "deployment_model": MappingProxyType(
            {
                "On-premise": "on_premise",
                "Cloud": "cloud",
                "SaaS": "saas",
                "PaaS": "paas",
                "IaaS": "iaas",
                "Hybrid": "hybrid",
                "Externě hostováno": "externally_hosted",
                "Neposouzeno": "not_assessed",
                "Nerelevantní": "not_applicable",
            }
        ),
        "gdpr_relevance": MappingProxyType({"Ano": "yes", "Ne": "no", "Neurčeno": "undetermined"}),
        "ai_relevance": MappingProxyType({"Ano": "yes", "Ne": "no", "Neurčeno": "undetermined"}),
        "data_classification": MappingProxyType(
            {
                "Bez dat / nerelevantní": "no_data_not_applicable",
                "Veřejná data": "public",
                "Interní data": "internal",
                "Důvěrná data": "confidential",
                "Vysoce důvěrná / regulovaná data": "highly_confidential_regulated",
                "Neposouzeno": "not_assessed",
            }
        ),
        "internet_exposed": MappingProxyType({"Ano": "yes", "Ne": "no"}),
        "preliminary_criticality": MappingProxyType(
            {
                "Nízká": "low",
                "Střední": "medium",
                "Vysoká": "high",
                "Kritická": "critical",
            }
        ),
        "lifecycle_state": MappingProxyType(
            {
                "V provozu": "operational",
                "Ve vývoji": "in_development",
                "Utlumováno": "being_decommissioned",
                "Legacy": "legacy",
                "Vyřazeno": "retired",
            }
        ),
        "review_state": MappingProxyType({"K revizi": "review_required", "Zkontrolováno": "reviewed"}),
    }
)

# Stable English terminology for formal/regulatory exports. UI presentation is
# localized separately; export producers never serialize internal codes or
# reuse the Czech workbook labels as a fallback.
ASSET_REGULATORY_EN_VALUES_BY_FIELD: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        "asset_type": MappingProxyType(
            {
                "application": "Application",
                "database": "Database",
                "infrastructure": "Infrastructure",
                "network_component": "Network component",
                "hardware": "Hardware",
                "cloud_service": "Cloud service",
                "data_storage": "Data storage",
                "information_asset": "Information asset",
                "security_asset": "Security asset",
                "bcm_dr_asset": "BCM/DR asset",
                "other": "Other",
            }
        ),
        "asset_level": MappingProxyType(
            {
                "primary": "Primary",
                "supporting": "Supporting",
                "infrastructure": "Infrastructure",
            }
        ),
        "deployment_model": MappingProxyType(
            {
                "on_premise": "On-premises",
                "cloud": "Cloud",
                "saas": "SaaS",
                "paas": "PaaS",
                "iaas": "IaaS",
                "hybrid": "Hybrid",
                "externally_hosted": "Externally hosted",
                "not_assessed": "Assessment not performed",
                "not_applicable": "Not applicable",
            }
        ),
        "gdpr_relevance": MappingProxyType({"yes": "Yes", "no": "No", "undetermined": "Undetermined"}),
        "ai_relevance": MappingProxyType({"yes": "Yes", "no": "No", "undetermined": "Undetermined"}),
        "data_classification": MappingProxyType(
            {
                "no_data_not_applicable": "No data / not applicable",
                "public": "Public data",
                "internal": "Internal data",
                "confidential": "Confidential data",
                "highly_confidential_regulated": "Highly confidential / regulated data",
                "not_assessed": "Assessment not performed",
            }
        ),
        "internet_exposed": MappingProxyType({"yes": "Yes", "no": "No"}),
        "preliminary_criticality": MappingProxyType(
            {"low": "Low", "medium": "Medium", "high": "High", "critical": "Critical"}
        ),
        "lifecycle_state": MappingProxyType(
            {
                "operational": "Operational",
                "in_development": "In development",
                "being_decommissioned": "Being decommissioned",
                "legacy": "Legacy",
                "retired": "Retired",
            }
        ),
        "review_state": MappingProxyType({"review_required": "Review required", "reviewed": "Reviewed"}),
    }
)


def asset_controlled_value_code(field: str, value: str) -> str:
    """Return a canonical Asset code for an import value or existing code."""

    try:
        codes = ASSET_CONTROLLED_CODES_BY_FIELD[field]
        workbook_map = WORKBOOK_ASSET_VALUE_TO_CODE_BY_FIELD[field]
    except KeyError as exc:
        raise ValueError(f"Unsupported Asset controlled field: {field}") from exc
    if value in codes:
        return value
    try:
        return workbook_map[value]
    except KeyError as exc:
        raise ValueError(f"Unsupported Asset {field} value: {value}") from exc


def asset_regulatory_value(field: str, code: str) -> str:
    """Map a canonical Asset code to stable English export terminology."""

    try:
        return ASSET_REGULATORY_EN_VALUES_BY_FIELD[field][code]
    except KeyError as exc:
        raise ValueError(f"Unsupported regulatory Asset {field} code: {code}") from exc
