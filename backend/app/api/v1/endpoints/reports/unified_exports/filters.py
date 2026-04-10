from datetime import date, timedelta
from typing import Any

from app.models.control import ControlStatus
from app.models.risk import RiskStatus
from app.models.vendor import VendorStatus
from app.services._kri_history.periods import period_bounds_for_date

from ._shared import ControlMonitoringExportStatus, KRIExportStatus, KRIMonitoringExportStatus, _contains


def _normalize_kri_status(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for row in rows:
        row["status"] = "archived" if bool(row.get("is_archived")) else "active"
    return rows


def _filter_rows_by_risk_criteria(
    rows: list[dict[str, Any]],
    *,
    status_filter: str | None,
    search: str | None,
    risk_type: str | None,
    is_priority: bool | None,
) -> list[dict[str, Any]]:
    filtered = rows

    if status_filter:
        filtered = [r for r in filtered if str(r.get("status")) == status_filter]
    else:
        filtered = [r for r in filtered if str(r.get("status")) != RiskStatus.archived.value]

    if risk_type:
        filtered = [r for r in filtered if str(r.get("risk_type") or "") == risk_type]

    if is_priority is not None:
        filtered = [r for r in filtered if bool(r.get("is_priority")) == is_priority]

    if search:
        needle = search.strip().lower()
        filtered = [
            r
            for r in filtered
            if any(
                _contains(r.get(field), needle)
                for field in ("risk_id_code", "name", "description", "process", "category")
            )
        ]

    return sorted(filtered, key=lambda x: str(x.get("risk_id_code") or ""))


def _filter_rows_by_control_criteria(
    rows: list[dict[str, Any]],
    *,
    status_filter: str | None,
    monitoring_status_filter: ControlMonitoringExportStatus | None,
    search: str | None,
) -> list[dict[str, Any]]:
    filtered = rows
    if status_filter:
        filtered = [r for r in filtered if str(r.get("status")) == status_filter]
    else:
        filtered = [r for r in filtered if str(r.get("status")) != ControlStatus.archived.value]

    if search:
        needle = search.strip().lower()
        filtered = [
            r
            for r in filtered
            if any(
                _contains(r.get(field), needle)
                for field in (
                    "name",
                    "description",
                    "department_name",
                    "risk_name",
                    "risk_id_code",
                    "risk_department_name",
                )
            )
        ]

    if monitoring_status_filter:
        filtered = [r for r in filtered if str(r.get("monitoring_status")) == monitoring_status_filter]

    return sorted(filtered, key=lambda x: str(x.get("name") or ""))


def _filter_rows_by_kri_criteria(
    rows: list[dict[str, Any]],
    *,
    status_filter: KRIExportStatus,
    monitoring_status_filter: KRIMonitoringExportStatus | None,
    timeliness_status_filter: str | None,
    search: str | None,
    as_of_date: date,
) -> list[dict[str, Any]]:
    filtered = rows

    if status_filter == "archived":
        filtered = [r for r in filtered if bool(r.get("is_archived"))]
    else:
        filtered = [r for r in filtered if not bool(r.get("is_archived"))]

    if status_filter == "within":
        filtered = [r for r in filtered if str(r.get("breach_status")) == "within"]
    elif status_filter == "breach":
        filtered = [r for r in filtered if str(r.get("breach_status")) in {"below", "above"}]
    elif status_filter == "overdue":
        filtered = [
            r
            for r in filtered
            if r.get("last_period_end") is not None
            and isinstance(r.get("last_period_end"), date)
            and r["last_period_end"] < as_of_date
        ]

    if search:
        needle = search.strip().lower()
        filtered = [r for r in filtered if _contains(r.get("metric_name"), needle)]

    if monitoring_status_filter:
        filtered = [r for r in filtered if str(r.get("monitoring_status")) == monitoring_status_filter]

    if timeliness_status_filter == "due_soon":
        due_soon_rows: list[dict[str, Any]] = []
        for row in filtered:
            frequency = row.get("frequency")
            if not isinstance(frequency, str):
                continue
            _, current_period_end = period_bounds_for_date(as_of_date, frequency)
            advance_date = current_period_end - timedelta(days=7)
            last_period_end = row.get("last_period_end")
            if not (advance_date <= as_of_date < current_period_end):
                continue
            if (
                last_period_end is not None
                and isinstance(last_period_end, date)
                and last_period_end >= current_period_end
            ):
                continue
            due_soon_rows.append(row)
        filtered = due_soon_rows

    return sorted(filtered, key=lambda x: str(x.get("metric_name") or ""))


def _filter_rows_by_vendor_criteria(
    rows: list[dict[str, Any]],
    *,
    status_filter: str | None,
    search: str | None,
    vendor_type: str | None,
) -> list[dict[str, Any]]:
    filtered = rows

    if status_filter:
        filtered = [r for r in filtered if str(r.get("status")) == status_filter]
    else:
        filtered = [r for r in filtered if str(r.get("status")) == VendorStatus.active.value]

    if vendor_type:
        filtered = [r for r in filtered if str(r.get("vendor_type") or "") == vendor_type]

    if search:
        needle = search.strip().lower()
        filtered = [
            r for r in filtered if any(_contains(r.get(field), needle) for field in ("name", "legal_name", "process"))
        ]

    return sorted(filtered, key=lambda x: str(x.get("name") or ""))
