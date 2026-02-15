from datetime import date
from typing import Any

from app.models.control import ControlStatus
from app.models.risk import RiskStatus
from app.models.vendor import VendorStatus

from ._shared import KRIExportStatus, _contains


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

    return sorted(filtered, key=lambda x: str(x.get("name") or ""))


def _filter_rows_by_kri_criteria(
    rows: list[dict[str, Any]],
    *,
    status_filter: KRIExportStatus,
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

