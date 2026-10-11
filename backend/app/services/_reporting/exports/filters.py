from datetime import date
from typing import Any

from app.core.datetime_utils import utc_now
from app.core.permissions import get_user_department_ids
from app.models import User
from app.services.kri_populations import is_due_soon, is_live, is_overdue

from .kri_population import population_state
from .shared import ControlMonitoringExportStatus, KRIExportStatus, KRIMonitoringExportStatus, _contains, _safe_int


def _prefilter_department_id_for_as_of(as_of_date: date, department_id: int | None) -> int | None:
    if department_id is not None and as_of_date < utc_now().date():
        return None
    return department_id


def _filter_rows_by_final_scope(
    rows: list[dict[str, Any]],
    *,
    current_user: User,
    department_id: int | None,
    owner_field: str | None,
    extra_visible_ids: set[int] | None = None,
    extra_visible_id_field: str = "id",
    exclude_unassigned_for_scoped: bool = False,
) -> list[dict[str, Any]]:
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        if department_id is None:
            return rows
        return [row for row in rows if _safe_int(row.get("department_id")) == department_id]

    if department_id is not None:
        return [row for row in rows if _safe_int(row.get("department_id")) == department_id]

    scoped_dept_ids = set(dept_ids)
    visible_ids = extra_visible_ids or set()
    filtered: list[dict[str, Any]] = []
    for row in rows:
        raw_department_id = row.get("department_id")
        if exclude_unassigned_for_scoped and raw_department_id is None:
            continue
        row_dept_id = _safe_int(raw_department_id)
        if row_dept_id in scoped_dept_ids:
            filtered.append(row)
            continue
        if owner_field is not None and _safe_int(row.get(owner_field)) == current_user.id:
            filtered.append(row)
            continue
        if _safe_int(row.get(extra_visible_id_field)) in visible_ids:
            filtered.append(row)
    return filtered


def _normalize_kri_status(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for row in rows:
        row["status"] = "active" if is_live(population_state(row)) else "archived"
    return rows


def _normalize_vendor_status(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for row in rows:
        row["status"] = "archived" if bool(row.get("is_archived")) else "active"
    return rows


def _filter_rows_by_control_criteria(
    rows: list[dict[str, Any]],
    *,
    status_filter: str | None,
    monitoring_status_filter: ControlMonitoringExportStatus | None,
    search: str | None,
) -> list[dict[str, Any]]:
    filtered = rows
    if status_filter:
        if status_filter == "archived":
            filtered = [r for r in filtered if bool(r.get("is_archived"))]
        else:
            filtered = [r for r in filtered if str(r.get("status")) == status_filter and not bool(r.get("is_archived"))]
    else:
        filtered = [r for r in filtered if not bool(r.get("is_archived"))]

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
        filtered = [r for r in filtered if not is_live(population_state(r))]
    else:
        filtered = [r for r in filtered if is_live(population_state(r))]

    if status_filter == "within":
        filtered = [r for r in filtered if str(r.get("breach_status")) == "within"]
    elif status_filter == "breach":
        filtered = [r for r in filtered if str(r.get("breach_status")) in {"below", "above"}]
    elif status_filter == "overdue":
        filtered = [r for r in filtered if is_overdue(population_state(r), today=as_of_date)]

    if search:
        needle = search.strip().lower()
        filtered = [r for r in filtered if _contains(r.get("metric_name"), needle)]

    if monitoring_status_filter:
        filtered = [r for r in filtered if str(r.get("monitoring_status")) == monitoring_status_filter]

    if timeliness_status_filter == "due_soon":
        filtered = [r for r in filtered if is_due_soon(population_state(r), today=as_of_date)]

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
        if status_filter in {"archived", "inactive"}:
            filtered = [r for r in filtered if bool(r.get("is_archived"))]
        else:
            filtered = [r for r in filtered if str(r.get("status")) == status_filter and not bool(r.get("is_archived"))]
    else:
        filtered = [r for r in filtered if not bool(r.get("is_archived"))]

    if vendor_type:
        filtered = [r for r in filtered if str(r.get("vendor_type") or "") == vendor_type]

    if search:
        needle = search.strip().lower()
        filtered = [
            r for r in filtered if any(_contains(r.get(field), needle) for field in ("name", "legal_name", "process"))
        ]

    return sorted(filtered, key=lambda x: str(x.get("name") or ""))
