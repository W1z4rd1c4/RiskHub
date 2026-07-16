from __future__ import annotations

from typing import Any, Literal

from fastapi.responses import StreamingResponse

from app.services._reporting.tabular import generate_tabular_csv

RegisterExportLocale = Literal["en", "cs"]

_LABELS = {
    "en": {
        "yes": "Yes",
        "no": "No",
        "active": "Active",
        "archived": "Archived",
        "new": "New",
        "not_submitted": "Not submitted",
        "breach": "Breach",
        "warning": "Warning",
        "optimal": "Optimal",
        "due_soon": "Due soon",
        "above": "Above upper limit",
        "below": "Below lower limit",
        "within": "Within limits",
        "open": "Open",
        "triaged": "Triaged",
        "in_progress": "In progress",
        "ready_for_validation": "Ready for validation",
        "closed": "Closed",
        "low": "Low",
        "medium": "Medium",
        "high": "High",
        "critical": "Critical",
        "daily": "Daily",
        "weekly": "Weekly",
        "monthly": "Monthly",
        "quarterly": "Quarterly",
        "annually": "Annually",
        "manual": "Manual",
        "control_execution": "Control execution",
        "kri_breach": "KRI breach",
        "audit": "Audit",
        "draft": "Draft",
        "blocked": "Blocked",
        "completed": "Completed",
        "requested": "Requested",
        "approved": "Approved",
        "revoked": "Revoked",
        "expired": "Expired",
    },
    "cs": {
        "yes": "Ano",
        "no": "Ne",
        "active": "Aktivní",
        "archived": "Archivováno",
        "new": "Nové",
        "not_submitted": "Neodevzdáno",
        "breach": "Překročení",
        "warning": "Varování",
        "optimal": "Optimální",
        "due_soon": "Brzy splatné",
        "above": "Nad horním limitem",
        "below": "Pod dolním limitem",
        "within": "V limitech",
        "open": "Otevřené",
        "triaged": "Vyhodnocené",
        "in_progress": "V řešení",
        "ready_for_validation": "Připraveno k ověření",
        "closed": "Uzavřené",
        "low": "Nízká",
        "medium": "Střední",
        "high": "Vysoká",
        "critical": "Kritická",
        "daily": "Denně",
        "weekly": "Týdně",
        "monthly": "Měsíčně",
        "quarterly": "Čtvrtletně",
        "annually": "Ročně",
        "manual": "Ruční",
        "control_execution": "Provedení kontroly",
        "kri_breach": "Překročení KRI",
        "audit": "Audit",
        "draft": "Návrh",
        "blocked": "Blokováno",
        "completed": "Dokončeno",
        "requested": "Požadováno",
        "approved": "Schváleno",
        "revoked": "Zrušeno",
        "expired": "Expirovalo",
    },
}


def _code(value: Any) -> str:
    if value is None:
        return ""
    return str(getattr(value, "value", value))


def _label(locale: RegisterExportLocale, value: Any) -> str:
    code = _code(value)
    return _LABELS[locale].get(code, code)


def _stream_csv(*, filename: str, headers: list[str], rows: list[list[Any]]) -> StreamingResponse:
    content = generate_tabular_csv(headers, rows)
    return StreamingResponse(
        iter((content,)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def render_kri_register_csv(
    rows: list[dict[str, Any]],
    *,
    locale: RegisterExportLocale,
) -> StreamingResponse:
    """Render the current list snapshot; historical replay stays under reports."""

    headers = [
        "metric",
        "description",
        "risk_id",
        "risk_name",
        "department",
        "current_value",
        "lower_limit",
        "upper_limit",
        "unit",
        "breach_code",
        "breach_label",
        "frequency_code",
        "frequency_label",
        "monitoring_status_code",
        "monitoring_status_label",
        "timeliness_status_code",
        "timeliness_status_label",
        "required_due_date",
        "days_overdue",
        "reporting_owner",
        "last_reported_at",
        "lifecycle_code",
        "lifecycle_label",
    ]
    export_rows = []
    for row in rows:
        breach = _code(row.get("breach_status"))
        frequency = _code(row.get("frequency"))
        monitoring_status = _code(row.get("monitoring_status"))
        timeliness_status = _code(row.get("timeliness_status"))
        lifecycle = _code(row.get("effective_lifecycle")) or (
            "archived" if bool(row.get("is_archived")) else "active"
        )
        export_rows.append(
            [
                row.get("metric_name"),
                row.get("description"),
                row.get("risk_id_code"),
                row.get("risk_name"),
                row.get("department_name"),
                row.get("current_value"),
                row.get("lower_limit"),
                row.get("upper_limit"),
                row.get("unit"),
                breach,
                _label(locale, breach),
                frequency,
                _label(locale, frequency),
                monitoring_status,
                _label(locale, monitoring_status),
                timeliness_status,
                _label(locale, timeliness_status),
                row.get("required_due_date"),
                row.get("days_overdue"),
                row.get("reporting_owner_name"),
                row.get("last_reported_at"),
                lifecycle,
                _label(locale, lifecycle),
            ]
        )
    return _stream_csv(filename="kris.csv", headers=headers, rows=export_rows)


def render_issue_register_csv(
    rows: list[dict[str, Any]],
    *,
    locale: RegisterExportLocale,
) -> StreamingResponse:
    """Render exact current Issue rows without dropping remediation context."""

    headers = [
        "issue_id",
        "title",
        "status_code",
        "status_label",
        "severity_code",
        "severity_label",
        "source_type_code",
        "source_type_label",
        "source_id",
        "source_display",
        "source_link_type",
        "source_link_label",
        "department",
        "owner",
        "due_at",
        "overdue_code",
        "overdue_label",
        "age_days",
        "linked_risk_ids",
        "linked_risks",
        "linked_control_ids",
        "linked_controls",
        "linked_execution_ids",
        "linked_kri_ids",
        "linked_kris",
        "remediation_status_code",
        "remediation_status_label",
        "remediation_progress",
        "remediation_owner",
        "remediation_target_date",
        "exception_status_code",
        "exception_status_label",
        "exception_expires_at",
    ]
    export_rows = []
    for row in rows:
        status = _code(row.get("status"))
        severity = _code(row.get("severity"))
        overdue = "yes" if bool(row.get("is_overdue")) else "no"
        source_type = _code(row.get("source_type"))
        remediation_status = _code(row.get("remediation_status"))
        exception_status = _code(row.get("exception_status"))
        export_rows.append(
            [
                row.get("id"),
                row.get("title"),
                status,
                _label(locale, status),
                severity,
                _label(locale, severity),
                source_type,
                _label(locale, source_type),
                row.get("source_id"),
                row.get("source_display"),
                row.get("source_link_type"),
                row.get("source_link_label"),
                row.get("department_name"),
                row.get("owner_name"),
                row.get("due_at"),
                overdue,
                _label(locale, overdue),
                row.get("age_days"),
                row.get("risk_ids"),
                row.get("risk_names"),
                row.get("control_ids"),
                row.get("control_names"),
                row.get("execution_ids"),
                row.get("kri_ids"),
                row.get("kri_names"),
                remediation_status,
                _label(locale, remediation_status),
                row.get("remediation_progress_percent"),
                row.get("remediation_owner_name"),
                row.get("remediation_target_date"),
                exception_status,
                _label(locale, exception_status),
                row.get("exception_expires_at"),
            ]
        )
    return _stream_csv(filename="issues.csv", headers=headers, rows=export_rows)
