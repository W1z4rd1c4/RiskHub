from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from fastapi.responses import StreamingResponse

from app.schemas.threat import ThreatListItem
from app.services._ict_register_reference import WORKBOOK_THREAT_CATEGORY_TO_CODE
from app.services._reporting.tabular import generate_tabular_csv

ThreatExportLocale = Literal["en", "cs"]

_CATEGORY_EN = {
    "availability": "Availability",
    "integrity": "Integrity",
    "confidentiality": "Confidentiality",
    "authenticity": "Authenticity",
    "physical": "Physical",
    "personnel": "Personnel",
    "third_party": "Third party",
}
_CATEGORY_CS = {code: label for label, code in WORKBOOK_THREAT_CATEGORY_TO_CODE.items()}


def _category_label(locale: ThreatExportLocale, code: str | None) -> str:
    if code is None:
        return ""
    return (_CATEGORY_EN if locale == "en" else _CATEGORY_CS).get(code, "")


def render_threat_register_csv(
    rows: list[ThreatListItem],
    *,
    risk_memberships: Mapping[int, set[int]],
    risk_labels: Mapping[int, str],
    locale: ThreatExportLocale,
) -> StreamingResponse:
    """Render the standard Threat export from the exact shared-list matches."""
    headers = [
        "name",
        "category_code",
        "category_label",
        "description",
        "typical_weaknesses",
        "relevant_subject",
        "threat_steward",
        "visible_linked_risk_count",
        "linked_risks",
        "lifecycle",
    ]
    export_rows: list[list[object]] = []
    for row in rows:
        labels = [risk_labels[risk_id] for risk_id in sorted(risk_memberships.get(row.id, set()))]
        export_rows.append(
            [
                row.name,
                row.category or "",
                _category_label(locale, row.category),
                row.description or "",
                row.typical_weaknesses or "",
                row.relevant_subject or "",
                row.threat_steward.name if row.threat_steward else "",
                row.visible_linked_risk_count,
                "; ".join(labels),
                "archived" if row.is_archived else "active",
            ]
        )
    content = generate_tabular_csv(headers, export_rows)
    return StreamingResponse(
        iter((content,)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=threats.csv"},
    )
