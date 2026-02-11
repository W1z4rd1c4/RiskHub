"""
Report generation endpoints.

Includes legacy risk/control Excel endpoints and unified export endpoints
for risks/controls/kris/vendors with format + as_of_date support.
"""

from datetime import UTC, date, datetime, time
from io import BytesIO
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    get_control_ids_where_owner,
    get_issue_scope_clause,
    get_kri_ids_where_reporting_owner,
    get_risk_ids_where_control_owner,
    get_risk_ids_where_kri_reporting_owner,
    get_user_department_ids,
    has_permission,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import (
    Control,
    ControlExecution,
    Department,
    Issue,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    Risk,
    User,
    Vendor,
)
from app.models.activity_log import ActivityEntityType
from app.models.control import ControlStatus
from app.models.issue import IssueExceptionStatus, IssueSeverity, IssueStatus
from app.models.kri_history import KRIValueHistory
from app.models.risk import ControlRiskLink, RiskStatus
from app.models.vendor import VendorStatus
from app.services.export_snapshot_service import ExportSnapshotService
from app.services.report_service import (
    generate_audit_trail_excel,
    generate_tabular_csv,
    generate_tabular_excel,
)

router = APIRouter()

_EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_CSV_MEDIA_TYPE = "text/csv; charset=utf-8"

ExportFormat = Literal["xlsx", "csv"]
KRIExportStatus = Literal["all", "within", "breach", "overdue", "archived"]


# =============================================================================
# Streaming helpers
# =============================================================================

def _get_filename(base: str, ext: str, as_of_date: date | None = None) -> str:
    date_str = (as_of_date or datetime.now(UTC).date()).strftime("%Y-%m-%d")
    return f"{base}-{date_str}.{ext}"


def _stream_binary(
    *,
    filename_base: str,
    export_format: ExportFormat,
    content_bytes: bytes,
    as_of_date: date | None = None,
) -> StreamingResponse:
    ext = "xlsx" if export_format == "xlsx" else "csv"
    media_type = {
        "xlsx": _EXCEL_MEDIA_TYPE,
        "csv": _CSV_MEDIA_TYPE,
    }[export_format]
    return StreamingResponse(
        BytesIO(content_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{_get_filename(filename_base, ext, as_of_date)}"'},
    )


# =============================================================================
# Department scoping
# =============================================================================

def _validate_department_access(department_id: Optional[int], dept_ids: Optional[list[int]]) -> None:
    if dept_ids is None:
        return
    if department_id and department_id not in dept_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this department's reports",
        )


def _user_has_no_departments(dept_ids: Optional[list[int]]) -> bool:
    return dept_ids is not None and len(dept_ids) == 0


# =============================================================================
# Legacy query builders (summary + audit trail remain unchanged)
# =============================================================================

def _controls_report_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    status_filter: Optional[str],
) -> Select:
    query = select(Control).options(selectinload(Control.department))

    if dept_ids is not None:
        query = query.where(Control.department_id.in_(dept_ids))

    if department_id:
        query = query.where(Control.department_id == department_id)
    if status_filter:
        query = query.where(Control.status == status_filter)

    return query.order_by(Control.name)


def _risks_report_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    status_filter: Optional[str],
) -> Select:
    query = select(Risk).options(selectinload(Risk.department))

    if dept_ids is not None:
        query = query.where(Risk.department_id.in_(dept_ids))

    if department_id:
        query = query.where(Risk.department_id == department_id)
    if status_filter:
        query = query.where(Risk.status == status_filter)

    return query.order_by(Risk.process)


def _audit_trail_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    result_filter: Optional[str],
    control_id: Optional[int],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
) -> Select:
    query = (
        select(ControlExecution)
        .join(Control, ControlExecution.control_id == Control.id)
        .options(
            selectinload(ControlExecution.control).selectinload(Control.department),
            selectinload(ControlExecution.control).selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            selectinload(ControlExecution.executed_by),
        )
    )

    if dept_ids is not None:
        query = query.where(Control.department_id.in_(dept_ids))

    if department_id:
        query = query.where(Control.department_id == department_id)
    if result_filter:
        query = query.where(ControlExecution.result == result_filter)
    if control_id:
        query = query.where(ControlExecution.control_id == control_id)
    if from_date:
        query = query.where(ControlExecution.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecution.executed_at <= to_date)

    return query.order_by(ControlExecution.executed_at.desc())


# =============================================================================
# Unified export internals
# =============================================================================

def _contains(haystack: Any, needle: str) -> bool:
    if haystack is None:
        return False
    return needle in str(haystack).lower()


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _normalize_kri_status(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for row in rows:
        row["status"] = "archived" if bool(row.get("is_archived")) else "active"
    return rows


def _unique_ids(rows: list[dict[str, Any]], id_field: str) -> list[int]:
    values = {
        _safe_int(row.get(id_field))
        for row in rows
        if row.get(id_field) is not None and _safe_int(row.get(id_field)) > 0
    }
    return sorted(values)


async def _rehydrate_user_names(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    *,
    user_id_field: str,
    user_name_field: str,
) -> list[dict[str, Any]]:
    user_ids = _unique_ids(rows, user_id_field)
    user_name_by_id: dict[int, str] = {}
    if user_ids:
        result = await db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))
        user_name_by_id = {int(user_id): name for user_id, name in result.all()}

    for row in rows:
        user_id = row.get(user_id_field)
        if user_id is None:
            row[user_name_field] = None
            continue
        row[user_name_field] = user_name_by_id.get(_safe_int(user_id))

    return rows


async def _rehydrate_department_names(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    *,
    department_id_field: str,
    department_name_field: str,
) -> list[dict[str, Any]]:
    department_ids = _unique_ids(rows, department_id_field)
    department_name_by_id: dict[int, str] = {}
    if department_ids:
        result = await db.execute(select(Department.id, Department.name).where(Department.id.in_(department_ids)))
        department_name_by_id = {int(department_id): name for department_id, name in result.all()}

    for row in rows:
        department_id = row.get(department_id_field)
        if department_id is None:
            row[department_name_field] = None
            continue
        row[department_name_field] = department_name_by_id.get(_safe_int(department_id))

    return rows


def _risk_to_row(risk: Risk) -> dict[str, Any]:
    return {
        "id": risk.id,
        "risk_id_code": risk.risk_id_code,
        "name": risk.name,
        "process": risk.process,
        "category": risk.category,
        "risk_type": risk.risk_type,
        "description": risk.description,
        "gross_probability": risk.gross_probability,
        "gross_impact": risk.gross_impact,
        "gross_score": risk.gross_score,
        "net_probability": risk.net_probability,
        "net_impact": risk.net_impact,
        "net_score": risk.net_score,
        "status": risk.status,
        "is_priority": bool(risk.is_priority),
        "owner_id": risk.owner_id,
        "owner_name": risk.owner.name if getattr(risk, "owner", None) else None,
        "department_id": risk.department_id,
        "department_name": risk.department.name if getattr(risk, "department", None) else None,
        "control_count": len(risk.control_links or []),
        "kri_count": len(risk.kris or []),
        "created_at": risk.created_at,
        "updated_at": risk.updated_at,
    }


def _control_to_row(control: Control) -> dict[str, Any]:
    first_risk = control.risk_links[0].risk if control.risk_links else None
    return {
        "id": control.id,
        "name": control.name,
        "description": control.description,
        "status": control.status,
        "frequency": control.frequency,
        "control_form": control.control_form,
        "risk_level": control.risk_level,
        "department_id": control.department_id,
        "department_name": control.department.name if getattr(control, "department", None) else None,
        "control_owner_id": control.control_owner_id,
        "control_owner_name": control.control_owner.name if getattr(control, "control_owner", None) else None,
        "risk_id_code": first_risk.risk_id_code if first_risk else None,
        "risk_name": first_risk.name if first_risk else None,
        "risk_owner_name": first_risk.owner.name if first_risk and first_risk.owner else None,
        "risk_department_name": first_risk.department.name if first_risk and first_risk.department else None,
        "linked_risk_count": len(control.risk_links or []),
        "created_at": control.created_at,
    }


def _kri_to_row(kri: KeyRiskIndicator) -> dict[str, Any]:
    risk = kri.risk
    status = "archived" if kri.is_archived else "active"
    return {
        "id": kri.id,
        "risk_id": kri.risk_id,
        "risk_id_code": risk.risk_id_code if risk else None,
        "risk_name": risk.name if risk else None,
        "risk_status": risk.status if risk else None,
        "risk_owner_id": risk.owner_id if risk else None,
        "department_id": risk.department_id if risk else None,
        "department_name": risk.department.name if risk and risk.department else None,
        "metric_name": kri.metric_name,
        "description": kri.description,
        "current_value": kri.current_value,
        "lower_limit": kri.lower_limit,
        "upper_limit": kri.upper_limit,
        "unit": kri.unit,
        "breach_status": kri.breach_status,
        "frequency": kri.frequency,
        "status": status,
        "is_archived": bool(kri.is_archived),
        "archived_at": kri.archived_at,
        "archived_by_id": kri.archived_by_id,
        "reporting_owner_id": kri.reporting_owner_id,
        "reporting_owner_name": kri.reporting_owner.name if getattr(kri, "reporting_owner", None) else None,
        "last_reported_at": kri.last_reported_at,
        "last_period_end": kri.last_period_end,
        "created_at": kri.created_at,
    }


def _vendor_to_row(vendor: Vendor) -> dict[str, Any]:
    return {
        "id": vendor.id,
        "name": vendor.name,
        "legal_name": vendor.legal_name,
        "vendor_type": vendor.vendor_type,
        "process": vendor.process,
        "subprocess": vendor.subprocess,
        "description": vendor.description,
        "status": vendor.status,
        "department_id": vendor.department_id,
        "department_name": vendor.department.name if getattr(vendor, "department", None) else None,
        "outsourcing_owner_user_id": vendor.outsourcing_owner_user_id,
        "owner_name": vendor.outsourcing_owner.name if getattr(vendor, "outsourcing_owner", None) else None,
        "risk_score_1_5": vendor.risk_score_1_5,
        "dora_relevant": bool(vendor.dora_relevant),
        "is_significant_vendor": bool(vendor.is_significant_vendor),
        "supports_core_function": bool(vendor.supports_important_core_insurance_function),
        "created_at": vendor.created_at,
        "updated_at": vendor.updated_at,
    }


async def _fetch_risks_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Risk]:
    query = select(Risk).options(
        selectinload(Risk.department),
        selectinload(Risk.owner),
        selectinload(Risk.kris),
        selectinload(Risk.control_links),
    )

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
        control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
        cross_dept_risk_ids = set(reporting_owner_risk_ids) | set(control_owner_risk_ids)
        if cross_dept_risk_ids:
            query = query.where(
                or_(
                    Risk.department_id.in_(dept_ids),
                    Risk.owner_id == current_user.id,
                    Risk.id.in_(cross_dept_risk_ids),
                )
            )
        else:
            query = query.where(or_(Risk.department_id.in_(dept_ids), Risk.owner_id == current_user.id))
    elif department_id:
        query = query.where(Risk.department_id == department_id)

    result = await db.execute(query)
    return list(result.scalars().all())


async def _fetch_controls_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Control]:
    query = select(Control)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        owned_control_ids = await get_control_ids_where_owner(db, current_user.id)
        if owned_control_ids:
            query = query.where(or_(Control.department_id.in_(dept_ids), Control.id.in_(owned_control_ids)))
        else:
            query = query.where(Control.department_id.in_(dept_ids))
    elif department_id:
        query = query.where(Control.department_id == department_id)

    query = query.options(
        selectinload(Control.department),
        selectinload(Control.control_owner),
        selectinload(Control.risk_links).selectinload(ControlRiskLink.risk).selectinload(Risk.department),
        selectinload(Control.risk_links).selectinload(ControlRiskLink.risk).selectinload(Risk.owner),
    )

    result = await db.execute(query)
    return list(result.scalars().all())


async def _fetch_kris_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[KeyRiskIndicator]:
    query = select(KeyRiskIndicator).join(Risk)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        reporting_owner_kri_ids = await get_kri_ids_where_reporting_owner(db, current_user.id)
        if reporting_owner_kri_ids:
            query = query.where(
                or_(
                    Risk.department_id.in_(dept_ids),
                    KeyRiskIndicator.id.in_(reporting_owner_kri_ids),
                )
            )
        else:
            query = query.where(Risk.department_id.in_(dept_ids))

    if department_id and dept_ids is None:
        query = query.where(Risk.department_id == department_id)

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.department),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.owner),
    )

    result = await db.execute(query)
    return list(result.scalars().all())


async def _fetch_vendors_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Vendor]:
    query = select(Vendor)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if dept_ids:
            query = query.where(
                or_(
                    Vendor.department_id.in_(dept_ids),
                    Vendor.outsourcing_owner_user_id == current_user.id,
                )
            )
        else:
            query = query.where(Vendor.outsourcing_owner_user_id == current_user.id)
        query = query.where(Vendor.department_id.is_not(None))
    elif department_id is not None:
        query = query.where(Vendor.department_id == department_id)

    query = query.options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
    result = await db.execute(query)
    return list(result.scalars().all())


async def _apply_kri_history_as_of(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    as_of_date: date,
) -> list[dict[str, Any]]:
    kri_ids = [int(r["id"]) for r in rows if r.get("id") is not None]
    if not kri_ids:
        return rows

    result = await db.execute(
        select(KRIValueHistory)
        .where(KRIValueHistory.kri_id.in_(kri_ids), KRIValueHistory.period_end <= as_of_date)
        .order_by(
            KRIValueHistory.kri_id.asc(),
            KRIValueHistory.period_end.desc(),
            KRIValueHistory.recorded_at.desc(),
        )
    )
    history_rows = result.scalars().all()
    latest: dict[int, KRIValueHistory] = {}
    for item in history_rows:
        if item.kri_id not in latest:
            latest[item.kri_id] = item

    for row in rows:
        kri_id = _safe_int(row.get("id"))
        entry = latest.get(kri_id)
        if entry is None:
            continue
        row["current_value"] = entry.value
        row["lower_limit"] = entry.lower_limit
        row["upper_limit"] = entry.upper_limit
        row["unit"] = entry.unit
        row["breach_status"] = entry.breach_status
        row["last_period_end"] = entry.period_end
        row["last_reported_at"] = entry.recorded_at

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
            if r.get("last_period_end") is not None and isinstance(r.get("last_period_end"), date) and r["last_period_end"] < as_of_date
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
            r
            for r in filtered
            if any(_contains(r.get(field), needle) for field in ("name", "legal_name", "process"))
        ]

    return sorted(filtered, key=lambda x: str(x.get("name") or ""))


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _as_of_datetime(as_of_date: date) -> datetime:
    return datetime.combine(as_of_date, time.max, tzinfo=UTC)


def _issue_has_active_exception(issue: Issue, as_of_dt: datetime) -> bool:
    for exception in issue.exceptions:
        if exception.status != IssueExceptionStatus.approved.value:
            continue
        expires_at = _coerce_utc(exception.expires_at)
        if expires_at is not None and expires_at > as_of_dt:
            return True
    return False


def _latest_exception(issue: Issue):
    if not issue.exceptions:
        return None
    return max(
        issue.exceptions,
        key=lambda ex: _coerce_utc(ex.approved_at)
        or _coerce_utc(ex.requested_at)
        or _coerce_utc(ex.created_at)
        or datetime.min.replace(tzinfo=UTC),
    )


def _joined(values: list[str]) -> str:
    cleaned = [value.strip() for value in values if value and value.strip()]
    return "; ".join(sorted(set(cleaned)))


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _issue_to_row(issue: Issue, *, as_of_dt: datetime) -> dict[str, Any]:
    links = issue.links or []
    risk_ids = [str(link.risk_id) for link in links if link.risk_id is not None]
    control_ids = [str(link.control_id) for link in links if link.control_id is not None]
    execution_ids = [str(link.execution_id) for link in links if link.execution_id is not None]
    kri_ids = [str(link.kri_id) for link in links if link.kri_id is not None]
    risk_names = [link.risk.name for link in links if link.risk is not None]
    control_names = [link.control.name for link in links if link.control is not None]
    kri_names = [link.kri.metric_name for link in links if link.kri is not None]

    remediation = issue.remediation_plan
    latest_exception = _latest_exception(issue)
    active_exception = _issue_has_active_exception(issue, as_of_dt)
    due_at = _coerce_utc(issue.due_at)
    opened_at = _coerce_utc(issue.opened_at)
    age_days = (as_of_dt - opened_at).days if opened_at is not None else 0
    age_days = max(age_days, 0)
    is_overdue = (
        issue.status != IssueStatus.closed.value
        and not active_exception
        and due_at is not None
        and due_at < as_of_dt
    )

    return {
        "id": issue.id,
        "title": issue.title,
        "status": _enum_value(issue.status),
        "severity": _enum_value(issue.severity),
        "source_type": _enum_value(issue.source_type),
        "source_id": issue.source_id,
        "department_id": issue.department_id,
        "department_name": issue.department.name if issue.department else None,
        "owner_user_id": issue.owner_user_id,
        "owner_name": issue.owner.name if issue.owner else None,
        "due_at": due_at,
        "is_overdue": is_overdue,
        "age_days": age_days,
        "risk_ids": _joined(risk_ids),
        "risk_names": _joined(risk_names),
        "control_ids": _joined(control_ids),
        "control_names": _joined(control_names),
        "execution_ids": _joined(execution_ids),
        "kri_ids": _joined(kri_ids),
        "kri_names": _joined(kri_names),
        "remediation_status": _enum_value(remediation.status) if remediation else None,
        "remediation_progress_percent": remediation.progress_percent if remediation else None,
        "remediation_owner_id": remediation.owner_user_id if remediation else None,
        "remediation_owner_name": remediation.owner.name if remediation and remediation.owner else None,
        "remediation_target_date": remediation.target_date if remediation else None,
        "exception_status": _enum_value(latest_exception.status) if latest_exception else None,
        "exception_expires_at": _coerce_utc(latest_exception.expires_at) if latest_exception else None,
    }


async def _fetch_issues_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
    status_filter: IssueStatus | None,
    severity_filter: IssueSeverity | None,
    owner_user_id: int | None,
) -> list[Issue]:
    query = (
        select(Issue)
        .options(
            selectinload(Issue.department),
            selectinload(Issue.owner),
            selectinload(Issue.links).selectinload(IssueLink.risk),
            selectinload(Issue.links).selectinload(IssueLink.control),
            selectinload(Issue.links).selectinload(IssueLink.execution),
            selectinload(Issue.links).selectinload(IssueLink.kri),
            selectinload(Issue.remediation_plan).selectinload(IssueRemediationPlan.owner),
            selectinload(Issue.exceptions),
        )
    )

    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)
    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    if status_filter is not None:
        query = query.where(Issue.status == status_filter.value)
    if severity_filter is not None:
        query = query.where(Issue.severity == severity_filter.value)
    if owner_user_id is not None:
        query = query.where(Issue.owner_user_id == owner_user_id)

    result = await db.execute(query.order_by(Issue.id.asc()))
    return list(result.scalars().all())


async def _export_issues(
    *,
    db: AsyncSession,
    current_user: User,
    export_format: ExportFormat,
    as_of_date: date,
    department_id: int | None,
    status_filter: IssueStatus | None,
    severity_filter: IssueSeverity | None,
    owner_user_id: int | None,
    overdue_only: bool,
) -> StreamingResponse:
    models = await _fetch_issues_for_export(
        db,
        current_user=current_user,
        department_id=department_id,
        status_filter=status_filter,
        severity_filter=severity_filter,
        owner_user_id=owner_user_id,
    )
    as_of_dt = _as_of_datetime(as_of_date)
    rows = [_issue_to_row(issue, as_of_dt=as_of_dt) for issue in models]
    if overdue_only:
        rows = [row for row in rows if bool(row.get("is_overdue"))]

    headers = [
        "Issue ID",
        "Title",
        "Status",
        "Severity",
        "Source Type",
        "Source ID",
        "Department",
        "Owner",
        "Due At",
        "Overdue",
        "Age (days)",
        "Linked Risk IDs",
        "Linked Risks",
        "Linked Control IDs",
        "Linked Controls",
        "Linked Execution IDs",
        "Linked KRI IDs",
        "Linked KRIs",
        "Remediation Status",
        "Remediation Progress",
        "Remediation Owner",
        "Remediation Target Date",
        "Exception Status",
        "Exception Expires At",
    ]

    data_rows = [
        [
            row.get("id"),
            row.get("title"),
            row.get("status"),
            row.get("severity"),
            row.get("source_type"),
            row.get("source_id"),
            row.get("department_name"),
            row.get("owner_name"),
            row.get("due_at"),
            "yes" if row.get("is_overdue") else "no",
            row.get("age_days"),
            row.get("risk_ids"),
            row.get("risk_names"),
            row.get("control_ids"),
            row.get("control_names"),
            row.get("execution_ids"),
            row.get("kri_ids"),
            row.get("kri_names"),
            row.get("remediation_status"),
            row.get("remediation_progress_percent"),
            row.get("remediation_owner_name"),
            row.get("remediation_target_date"),
            row.get("exception_status"),
            row.get("exception_expires_at"),
        ]
        for row in rows
    ]

    return _render_export(
        title=f"Issue Export (as of {as_of_date.isoformat()})",
        sheet_name="Issues",
        filename_base="issues",
        export_format=export_format,
        headers=headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )


def _render_export(
    *,
    title: str,
    sheet_name: str,
    filename_base: str,
    export_format: ExportFormat,
    headers: list[str],
    data_rows: list[list[Any]],
    as_of_date: date,
) -> StreamingResponse:
    if export_format == "xlsx":
        content = generate_tabular_excel(sheet_name, headers, data_rows)
    else:
        content = generate_tabular_csv(headers, data_rows)

    return _stream_binary(
        filename_base=filename_base,
        export_format=export_format,
        content_bytes=content,
        as_of_date=as_of_date,
    )


async def _export_risks(
    *,
    db: AsyncSession,
    current_user: User,
    export_format: ExportFormat,
    as_of_date: date,
    department_id: int | None,
    status_filter: str | None,
    search: str | None,
    risk_type: str | None,
    is_priority: bool | None,
) -> StreamingResponse:
    models = await _fetch_risks_for_export(db, current_user=current_user, department_id=department_id)
    rows = [_risk_to_row(risk) for risk in models]
    rows = await ExportSnapshotService.apply_as_of_snapshot(
        db,
        rows=rows,
        entity_type=ActivityEntityType.RISK,
        as_of_date=as_of_date,
    )
    rows = await _rehydrate_user_names(db, rows, user_id_field="owner_id", user_name_field="owner_name")
    rows = await _rehydrate_department_names(
        db,
        rows,
        department_id_field="department_id",
        department_name_field="department_name",
    )
    rows = _filter_rows_by_risk_criteria(
        rows,
        status_filter=status_filter,
        search=search,
        risk_type=risk_type,
        is_priority=is_priority,
    )

    headers = [
        "Risk ID",
        "Name",
        "Process",
        "Category",
        "Type",
        "Gross Score",
        "Net Score",
        "Status",
        "Priority",
        "Owner",
        "Department",
        "Controls",
        "KRIs",
    ]
    data_rows = [
        [
            row.get("risk_id_code"),
            row.get("name"),
            row.get("process"),
            row.get("category"),
            row.get("risk_type"),
            row.get("gross_score"),
            row.get("net_score"),
            row.get("status"),
            "yes" if row.get("is_priority") else "no",
            row.get("owner_name"),
            row.get("department_name"),
            row.get("control_count"),
            row.get("kri_count"),
        ]
        for row in rows
    ]

    return _render_export(
        title=f"Risk Export (as of {as_of_date.isoformat()})",
        sheet_name="Risks",
        filename_base="risks",
        export_format=export_format,
        headers=headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )


async def _export_controls(
    *,
    db: AsyncSession,
    current_user: User,
    export_format: ExportFormat,
    as_of_date: date,
    department_id: int | None,
    status_filter: str | None,
    search: str | None,
) -> StreamingResponse:
    models = await _fetch_controls_for_export(db, current_user=current_user, department_id=department_id)
    rows = [_control_to_row(control) for control in models]
    rows = await ExportSnapshotService.apply_as_of_snapshot(
        db,
        rows=rows,
        entity_type=ActivityEntityType.CONTROL,
        as_of_date=as_of_date,
    )
    rows = await _rehydrate_user_names(
        db,
        rows,
        user_id_field="control_owner_id",
        user_name_field="control_owner_name",
    )
    rows = await _rehydrate_department_names(
        db,
        rows,
        department_id_field="department_id",
        department_name_field="department_name",
    )
    rows = _filter_rows_by_control_criteria(rows, status_filter=status_filter, search=search)

    headers = [
        "Name",
        "Description",
        "Department",
        "Owner",
        "Frequency",
        "Form",
        "Risk Level",
        "Status",
        "Linked Risk",
        "Linked Risk ID",
        "Linked Risks",
    ]
    data_rows = [
        [
            row.get("name"),
            row.get("description"),
            row.get("department_name"),
            row.get("control_owner_name"),
            row.get("frequency"),
            row.get("control_form"),
            row.get("risk_level"),
            row.get("status"),
            row.get("risk_name"),
            row.get("risk_id_code"),
            row.get("linked_risk_count"),
        ]
        for row in rows
    ]

    return _render_export(
        title=f"Control Export (as of {as_of_date.isoformat()})",
        sheet_name="Controls",
        filename_base="controls",
        export_format=export_format,
        headers=headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )


async def _export_kris(
    *,
    db: AsyncSession,
    current_user: User,
    export_format: ExportFormat,
    as_of_date: date,
    department_id: int | None,
    status_filter: KRIExportStatus,
    search: str | None,
) -> StreamingResponse:
    models = await _fetch_kris_for_export(db, current_user=current_user, department_id=department_id)
    rows = [_kri_to_row(kri) for kri in models]
    rows = await ExportSnapshotService.apply_as_of_snapshot(
        db,
        rows=rows,
        entity_type=ActivityEntityType.KRI,
        as_of_date=as_of_date,
    )
    rows = _normalize_kri_status(rows)
    rows = await _rehydrate_user_names(
        db,
        rows,
        user_id_field="reporting_owner_id",
        user_name_field="reporting_owner_name",
    )
    rows = await _rehydrate_department_names(
        db,
        rows,
        department_id_field="department_id",
        department_name_field="department_name",
    )
    rows = await _apply_kri_history_as_of(db, rows, as_of_date)
    rows = _filter_rows_by_kri_criteria(rows, status_filter=status_filter, search=search, as_of_date=as_of_date)

    headers = [
        "Metric",
        "Risk",
        "Risk ID",
        "Department",
        "Current Value",
        "Lower Limit",
        "Upper Limit",
        "Unit",
        "Breach",
        "Frequency",
        "Status",
        "Reporting Owner",
        "Last Reported",
    ]
    data_rows = [
        [
            row.get("metric_name"),
            row.get("risk_name"),
            row.get("risk_id_code"),
            row.get("department_name"),
            row.get("current_value"),
            row.get("lower_limit"),
            row.get("upper_limit"),
            row.get("unit"),
            row.get("breach_status"),
            row.get("frequency"),
            row.get("status"),
            row.get("reporting_owner_name"),
            row.get("last_reported_at"),
        ]
        for row in rows
    ]

    return _render_export(
        title=f"KRI Export (as of {as_of_date.isoformat()})",
        sheet_name="KRIs",
        filename_base="kris",
        export_format=export_format,
        headers=headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )


async def _export_vendors(
    *,
    db: AsyncSession,
    current_user: User,
    export_format: ExportFormat,
    as_of_date: date,
    department_id: int | None,
    status_filter: str | None,
    search: str | None,
    vendor_type: str | None,
) -> StreamingResponse:
    models = await _fetch_vendors_for_export(db, current_user=current_user, department_id=department_id)
    rows = [_vendor_to_row(vendor) for vendor in models]
    rows = await ExportSnapshotService.apply_as_of_snapshot(
        db,
        rows=rows,
        entity_type=ActivityEntityType.VENDOR,
        as_of_date=as_of_date,
    )
    rows = await _rehydrate_user_names(
        db,
        rows,
        user_id_field="outsourcing_owner_user_id",
        user_name_field="owner_name",
    )
    rows = await _rehydrate_department_names(
        db,
        rows,
        department_id_field="department_id",
        department_name_field="department_name",
    )
    rows = _filter_rows_by_vendor_criteria(rows, status_filter=status_filter, search=search, vendor_type=vendor_type)

    headers = [
        "Name",
        "Legal Name",
        "Type",
        "Process",
        "Subprocess",
        "Department",
        "Owner",
        "Risk Score",
        "DORA Relevant",
        "Significant",
        "Status",
    ]
    data_rows = [
        [
            row.get("name"),
            row.get("legal_name"),
            row.get("vendor_type"),
            row.get("process"),
            row.get("subprocess"),
            row.get("department_name"),
            row.get("owner_name"),
            row.get("risk_score_1_5"),
            "yes" if row.get("dora_relevant") else "no",
            "yes" if row.get("is_significant_vendor") else "no",
            row.get("status"),
        ]
        for row in rows
    ]

    return _render_export(
        title=f"Vendor Export (as of {as_of_date.isoformat()})",
        sheet_name="Vendors",
        filename_base="vendors",
        export_format=export_format,
        headers=headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )


# =============================================================================
# Legacy report endpoints (risk/control)
# =============================================================================

@router.get("/controls/excel")
async def download_controls_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = datetime.now(UTC).date()
    return await _export_controls(
        db=db,
        current_user=current_user,
        export_format="xlsx",
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=None,
    )


@router.get("/risks/excel")
async def download_risks_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = datetime.now(UTC).date()
    return await _export_risks(
        db=db,
        current_user=current_user,
        export_format="xlsx",
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=None,
        risk_type=None,
        is_priority=None,
    )


# =============================================================================
# Unified export endpoints
# =============================================================================

@router.get("/risks/export")
async def export_risks(
    format: ExportFormat = Query(..., description="Export format: xlsx, csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    risk_type: Optional[str] = Query(None),
    is_priority: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = as_of_date or datetime.now(UTC).date()
    return await _export_risks(
        db=db,
        current_user=current_user,
        export_format=format,
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=search,
        risk_type=risk_type,
        is_priority=is_priority,
    )


@router.get("/controls/export")
async def export_controls(
    format: ExportFormat = Query(..., description="Export format: xlsx, csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = as_of_date or datetime.now(UTC).date()
    return await _export_controls(
        db=db,
        current_user=current_user,
        export_format=format,
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=search,
    )


@router.get("/kris/export")
async def export_kris(
    format: ExportFormat = Query(..., description="Export format: xlsx, csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: KRIExportStatus = Query("all", alias="status"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = as_of_date or datetime.now(UTC).date()
    return await _export_kris(
        db=db,
        current_user=current_user,
        export_format=format,
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=search,
    )


@router.get("/vendors/export")
async def export_vendors(
    format: ExportFormat = Query(..., description="Export format: xlsx, csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    vendor_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = as_of_date or datetime.now(UTC).date()
    return await _export_vendors(
        db=db,
        current_user=current_user,
        export_format=format,
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=search,
        vendor_type=vendor_type,
    )


@router.get("/issues/export")
async def export_issues(
    format: ExportFormat = Query(..., description="Export format: xlsx, csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[IssueStatus] = Query(None, alias="status"),
    severity: Optional[IssueSeverity] = Query(None),
    owner_user_id: Optional[int] = Query(None),
    overdue_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    if not has_permission(current_user, "issues", "read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: issues:read",
        )

    as_of = as_of_date or datetime.now(UTC).date()
    return await _export_issues(
        db=db,
        current_user=current_user,
        export_format=format,
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        severity_filter=severity,
        owner_user_id=owner_user_id,
        overdue_only=overdue_only,
    )


# =============================================================================
# Existing summary/audit endpoints
# =============================================================================

@router.get("/summary/excel")
async def download_summary_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    """Download dashboard summary as Excel. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)

    summary: dict[str, Any] = {
        "total_controls": 0,
        "total_risks": 0,
        "critical_risks_count": 0,
        "average_net_risk_score": 0,
        "controls_by_status": {},
    }

    if not _user_has_no_departments(dept_ids):
        controls_query = select(Control)
        risks_query = select(Risk)

        if dept_ids is not None:
            controls_query = controls_query.where(Control.department_id.in_(dept_ids))
            risks_query = risks_query.where(Risk.department_id.in_(dept_ids))

        if department_id:
            controls_query = controls_query.where(Control.department_id == department_id)
            risks_query = risks_query.where(Risk.department_id == department_id)

        controls_result = await db.execute(controls_query)
        controls = controls_result.scalars().all()

        risks_result = await db.execute(risks_query)
        risks = risks_result.scalars().all()

        from app.models.global_config import ConfigDefaults

        total_controls = len(controls)
        total_risks = len(risks)
        critical_threshold = ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE
        critical_risks = sum(1 for r in risks if r.net_probability * r.net_impact >= critical_threshold)
        avg_net_score = sum(r.net_probability * r.net_impact for r in risks) / len(risks) if risks else 0

        controls_by_status: dict[str, int] = {}
        for control in controls:
            ctrl_status = control.status or "unknown"
            controls_by_status[ctrl_status] = controls_by_status.get(ctrl_status, 0) + 1

        summary = {
            "total_controls": total_controls,
            "total_risks": total_risks,
            "critical_risks_count": critical_risks,
            "average_net_risk_score": avg_net_score,
            "controls_by_status": controls_by_status,
        }

    headers = ["Metric", "Value"]
    rows: list[list[Any]] = [
        ["Total Controls", summary.get("total_controls", 0)],
        ["Total Risks", summary.get("total_risks", 0)],
        ["Critical Risks", summary.get("critical_risks_count", 0)],
        ["Average Net Risk Score", f"{float(summary.get('average_net_risk_score', 0)):.1f}"],
    ]

    controls_by_status = summary.get("controls_by_status") or {}
    if controls_by_status:
        rows.append(["", ""])
        rows.append(["Controls by Status", ""])
        for ctrl_status, count in controls_by_status.items():
            rows.append([str(ctrl_status).title(), count])

    return _stream_binary(
        filename_base="dashboard-summary",
        export_format="xlsx",
        content_bytes=generate_tabular_excel("Dashboard Summary", headers, rows),
        as_of_date=datetime.now(UTC).date(),
    )


@router.get("/audit-trail/excel")
async def download_audit_trail_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    result: Optional[str] = Query(None, description="Filter by result (passed/failed/warning)"),
    control_id: Optional[int] = Query(None, description="Filter by control"),
    from_date: Optional[datetime] = Query(None, description="Filter from date"),
    to_date: Optional[datetime] = Query(None, description="Filter to date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)

    if _user_has_no_departments(dept_ids):
        return _stream_binary(
            filename_base="audit-trail",
            export_format="xlsx",
            content_bytes=generate_audit_trail_excel([]),
            as_of_date=datetime.now(UTC).date(),
        )

    query = _audit_trail_query(dept_ids, department_id, result, control_id, from_date, to_date)
    result_set = await db.execute(query)
    executions = result_set.scalars().all()

    return _stream_binary(
        filename_base="audit-trail",
        export_format="xlsx",
        content_bytes=generate_audit_trail_excel(list(executions)),
        as_of_date=datetime.now(UTC).date(),
    )
