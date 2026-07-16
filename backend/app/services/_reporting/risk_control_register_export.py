from __future__ import annotations

from typing import Literal

from fastapi.responses import StreamingResponse

from app.schemas.control import ControlSummary
from app.schemas.risk import RiskSummary
from app.services._reporting.tabular import generate_tabular_csv

RegisterExportLocale = Literal["en", "cs"]

_COMMON_LABELS = {
    "en": {
        "yes": "Yes",
        "no": "No",
        "active": "Active",
        "emerging": "Emerging",
        "draft": "Draft",
        "inactive": "Inactive",
        "archived": "Archived",
        "manual": "Manual",
        "automatic": "Automatic",
        "new": "New",
        "needs_review": "Needs review",
        "failed": "Failed",
        "passed": "Passed",
        "daily": "Daily",
        "weekly": "Weekly",
        "monthly": "Monthly",
        "quarterly": "Quarterly",
        "semi-annually": "Semi-annually",
        "annually": "Annually",
        "ad_hoc": "Ad hoc",
        "continuous": "Continuous",
    },
    "cs": {
        "yes": "Ano",
        "no": "Ne",
        "active": "Aktivní",
        "emerging": "Vznikající",
        "draft": "Koncept",
        "inactive": "Neaktivní",
        "archived": "Archivováno",
        "manual": "Manuální",
        "automatic": "Automatická",
        "new": "Nové",
        "needs_review": "Vyžaduje kontrolu",
        "failed": "Neúspěšné",
        "passed": "Úspěšné",
        "daily": "Denně",
        "weekly": "Týdně",
        "monthly": "Měsíčně",
        "quarterly": "Čtvrtletně",
        "semi-annually": "Pololetně",
        "annually": "Ročně",
        "ad_hoc": "Ad hoc",
        "continuous": "Průběžně",
    },
}

_RISK_TYPE_LABELS = {
    "en": {
        "operational": "Operational",
        "financial": "Financial",
        "strategic": "Strategic",
        "compliance": "Compliance",
        "reputational": "Reputational",
    },
    "cs": {
        "operational": "Operační",
        "financial": "Finanční",
        "strategic": "Strategické",
        "compliance": "Compliance",
        "reputational": "Reputační",
    },
}


def _code(value) -> str:
    return str(getattr(value, "value", value))


def _label(locale: RegisterExportLocale, code: str) -> str:
    return _COMMON_LABELS[locale].get(code, code)


def _risk_type_label(
    locale: RegisterExportLocale,
    code: str,
    configured_type_labels: dict[str, str],
) -> str:
    return _RISK_TYPE_LABELS[locale].get(
        code,
        configured_type_labels.get(code, code),
    )


def _stream_csv(*, filename: str, headers: list[str], rows: list[list[object]]) -> StreamingResponse:
    content = generate_tabular_csv(headers, rows)
    return StreamingResponse(
        iter((content,)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def render_risk_register_csv(
    rows: list[RiskSummary],
    *,
    locale: RegisterExportLocale,
    configured_type_labels: dict[str, str] | None = None,
) -> StreamingResponse:
    configured_type_labels = configured_type_labels or {}
    headers = [
        "risk_id",
        "name",
        "process",
        "subprocess",
        "risk_type_code",
        "risk_type_label",
        "category",
        "gross_score",
        "net_score",
        "status_code",
        "status_label",
        "priority_code",
        "priority_label",
        "owning_department",
        "owner",
        "kri_count",
        "control_count",
        "breach_code",
        "breach_label",
        "lifecycle",
    ]
    export_rows: list[list[object]] = []
    for row in rows:
        risk_type = _code(row.risk_type)
        status = _code(row.status)
        priority = "yes" if row.is_priority else "no"
        breach = "yes" if row.has_breach else "no"
        export_rows.append(
            [
                row.risk_id_code,
                row.name,
                row.process,
                row.subprocess or "",
                risk_type,
                _risk_type_label(locale, risk_type, configured_type_labels),
                row.category or "",
                row.gross_score,
                row.net_score,
                status,
                _label(locale, status),
                priority,
                _label(locale, priority),
                row.department_name or "",
                row.owner_name or "",
                row.kri_count,
                row.control_count,
                breach,
                _label(locale, breach),
                "archived" if row.is_archived else "active",
            ]
        )
    return _stream_csv(filename="risks.csv", headers=headers, rows=export_rows)


def render_control_register_csv(
    rows: list[ControlSummary],
    *,
    locale: RegisterExportLocale,
) -> StreamingResponse:
    headers = [
        "name",
        "description",
        "owning_department",
        "owner",
        "frequency_code",
        "frequency_label",
        "risk_level",
        "status_code",
        "status_label",
        "control_form_code",
        "control_form_label",
        "monitoring_status_code",
        "monitoring_status_label",
        "linked_risk_id",
        "linked_risk_name",
        "lifecycle",
    ]
    export_rows: list[list[object]] = []
    for row in rows:
        frequency = _code(row.frequency)
        status = _code(row.status)
        control_form = _code(row.control_form)
        monitoring_status = _code(row.monitoring_status)
        export_rows.append(
            [
                row.name,
                row.description or "",
                row.department_name or "",
                row.control_owner_name or "",
                frequency,
                _label(locale, frequency),
                row.risk_level,
                status,
                _label(locale, status),
                control_form,
                _label(locale, control_form),
                monitoring_status,
                _label(locale, monitoring_status),
                row.risk_id_code or "",
                row.risk_name or "",
                "archived" if row.is_archived else "active",
            ]
        )
    return _stream_csv(filename="controls.csv", headers=headers, rows=export_rows)
