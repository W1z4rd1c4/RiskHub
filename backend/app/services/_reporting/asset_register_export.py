from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from fastapi.responses import StreamingResponse

from app.schemas.asset import AssetRead
from app.services._ict_register_reference.asset_values import (
    ASSET_REGULATORY_EN_VALUES_BY_FIELD,
    WORKBOOK_ASSET_VALUE_TO_CODE_BY_FIELD,
)
from app.services._reporting.tabular import generate_tabular_csv

AssetExportLocale = Literal["en", "cs"]


def _invert(source: Mapping[str, str]) -> dict[str, str]:
    return {code: label for label, code in source.items()}


_EN_LABELS = {field: dict(values) for field, values in ASSET_REGULATORY_EN_VALUES_BY_FIELD.items()}
_CS_LABELS = {field: _invert(values) for field, values in WORKBOOK_ASSET_VALUE_TO_CODE_BY_FIELD.items()}
for locale_labels, yes, no in ((_EN_LABELS, "Yes", "No"), (_CS_LABELS, "Ano", "Ne")):
    locale_labels["criticality"] = locale_labels["preliminary_criticality"]
    for field in ("cif", "legacy", "spof", "external_dependency"):
        locale_labels[field] = {"yes": yes, "no": no}

_LABELS: dict[str, dict[str, dict[str, str]]] = {"en": _EN_LABELS, "cs": _CS_LABELS}


def _label(locale: AssetExportLocale, field: str, code: str | None) -> str:
    if code is None:
        return ""
    return _LABELS[locale][field].get(code, "")


def render_asset_register_csv(rows: list[AssetRead], *, locale: AssetExportLocale) -> StreamingResponse:
    """Render safe standard Asset CSV from the exact shared-list matches."""
    headers = [
        "name",
        "alternative_names",
        "asset_type_code",
        "asset_type_label",
        "asset_level_code",
        "asset_level_label",
        "deployment_model_code",
        "deployment_model_label",
        "business_owner",
        "ict_owner",
        "owning_department",
        "physical_location",
        "criticality_code",
        "criticality_label",
        "cif_code",
        "cif_label",
        "lifecycle_state_code",
        "lifecycle_state_label",
        "legacy_code",
        "legacy_label",
        "spof_code",
        "spof_label",
        "external_dependency_code",
        "external_dependency_label",
        "gdpr_relevance_code",
        "gdpr_relevance_label",
        "ai_relevance_code",
        "ai_relevance_label",
        "internet_exposed_code",
        "internet_exposed_label",
        "data_classification_code",
        "data_classification_label",
        "is_complete",
        "lifecycle",
    ]
    export_rows: list[list[object]] = []
    for row in rows:
        derived = row.derived
        criticality = derived.resulting_criticality if derived else None
        cif = derived.cif if derived else None
        legacy = derived.legacy if derived else None
        spof = derived.spof if derived else None
        external_dependency = derived.external_dependency if derived else None
        export_rows.append(
            [
                row.name,
                row.alternative_names or "",
                row.asset_type or "",
                _label(locale, "asset_type", row.asset_type),
                row.asset_level or "",
                _label(locale, "asset_level", row.asset_level),
                row.deployment_model or "",
                _label(locale, "deployment_model", row.deployment_model),
                row.business_owner.name if row.business_owner else "",
                row.ict_owner.name if row.ict_owner else "",
                row.owning_department.name if row.owning_department else "",
                row.physical_location or "",
                criticality or "",
                _label(locale, "criticality", criticality),
                cif or "",
                _label(locale, "cif", cif),
                row.lifecycle_state or "",
                _label(locale, "lifecycle_state", row.lifecycle_state),
                legacy or "",
                _label(locale, "legacy", legacy),
                spof or "",
                _label(locale, "spof", spof),
                external_dependency or "",
                _label(locale, "external_dependency", external_dependency),
                row.gdpr_relevance or "",
                _label(locale, "gdpr_relevance", row.gdpr_relevance),
                row.ai_relevance or "",
                _label(locale, "ai_relevance", row.ai_relevance),
                row.internet_exposed or "",
                _label(locale, "internet_exposed", row.internet_exposed),
                row.data_classification or "",
                _label(locale, "data_classification", row.data_classification),
                str(bool(derived and derived.is_complete)).lower(),
                "archived" if row.is_archived else "active",
            ]
        )
    content = generate_tabular_csv(headers, export_rows)
    return StreamingResponse(
        iter((content,)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=assets.csv"},
    )
