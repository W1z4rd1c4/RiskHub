from __future__ import annotations

from typing import Literal

from fastapi.responses import StreamingResponse

from app.schemas.process import ProcessRead
from app.services._reporting.tabular import generate_tabular_csv

ProcessExportLocale = Literal["en", "cs"]

_LABELS: dict[str, dict[str, dict[str, str]]] = {
    "en": {
        "criticality": {"low": "Low", "medium": "Medium", "high": "High", "critical": "Critical"},
        "cif": {"yes": "Yes", "no": "No"},
        "licensed_activity": {
            "non_life_insurance": "Non-life insurance",
            "support_functions": "Support functions",
        },
        "bcm_link": {"yes": "Yes", "no": "No", "not_assessed": "Not assessed", "not_applicable": "Not applicable"},
        "dr_test_result": {
            "successful": "Successful",
            "qualified": "Qualified",
            "unsuccessful": "Unsuccessful",
            "not_tested": "Not tested",
        },
    },
    "cs": {
        "criticality": {"low": "Nízká", "medium": "Střední", "high": "Vysoká", "critical": "Kritická"},
        "cif": {"yes": "Ano", "no": "Ne"},
        "licensed_activity": {
            "non_life_insurance": "Neživotní pojištění",
            "support_functions": "Podpůrné funkce",
        },
        "bcm_link": {"yes": "Ano", "no": "Ne", "not_assessed": "Neposouzeno", "not_applicable": "Nerelevantní"},
        "dr_test_result": {
            "successful": "Úspěšný",
            "qualified": "S výhradami",
            "unsuccessful": "Neúspěšný",
            "not_tested": "Netestováno",
        },
    },
}


def _label(locale: ProcessExportLocale, field: str, code: str | None) -> str:
    if code is None:
        return ""
    return _LABELS[locale][field].get(code, "")


def render_process_register_csv(rows: list[ProcessRead], *, locale: ProcessExportLocale) -> StreamingResponse:
    """Render the standard Process export from the exact list-plan matches."""
    headers = [
        "f_code",
        "l0_area",
        "l1_process",
        "l2_subprocess",
        "process_owner",
        "owning_department",
        "criticality_code",
        "criticality_label",
        "cif_code",
        "cif_label",
        "is_complete",
        "licensed_activity_code",
        "licensed_activity_label",
        "bcm_link_code",
        "bcm_link_label",
        "dr_test_result_code",
        "dr_test_result_label",
        "mtpd_hours",
        "lifecycle",
    ]
    export_rows: list[list[object]] = []
    for row in rows:
        criticality = row.derived.criticality_class if row.derived else None
        cif = row.derived.cif if row.derived else None
        export_rows.append(
            [
                row.f_code,
                row.l0_area,
                row.l1_process,
                row.l2_subprocess or "",
                row.process_owner.name if row.process_owner else "",
                row.owning_department.name if row.owning_department else "",
                criticality or "",
                _label(locale, "criticality", criticality),
                cif or "",
                _label(locale, "cif", cif),
                str(bool(row.derived and row.derived.is_complete)).lower(),
                row.licensed_activity or "",
                _label(locale, "licensed_activity", row.licensed_activity),
                row.bcm_link or "",
                _label(locale, "bcm_link", row.bcm_link),
                row.dr_test_result or "",
                _label(locale, "dr_test_result", row.dr_test_result),
                "" if row.mtpd_hours is None else row.mtpd_hours,
                "archived" if row.is_archived else "active",
            ]
        )
    content = generate_tabular_csv(headers, export_rows)
    return StreamingResponse(
        iter((content,)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=processes.csv"},
    )
