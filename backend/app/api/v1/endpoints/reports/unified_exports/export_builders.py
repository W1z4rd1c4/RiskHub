from datetime import date
from typing import Literal

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_risk_ids_where_control_owner, get_risk_ids_where_kri_reporting_owner
from app.models import User
from app.models.activity_log import ActivityEntityType
from app.models.issue import IssueSeverity, IssueStatus
from app.services._monitoring_status import (
    ControlMonitoringFacts,
    KRIMonitoringFacts,
    derive_control_monitoring_snapshot,
    derive_kri_monitoring_snapshot,
    get_control_monitoring_config,
    get_kri_monitoring_config,
)
from app.services.export_snapshot_service import ExportSnapshotService

from ._shared import (
    ControlMonitoringExportStatus,
    ExportFormat,
    KRIExportStatus,
    KRIMonitoringExportStatus,
    _as_of_datetime,
)
from .fetch import (
    _apply_kri_history_as_of,
    _fetch_controls_for_export,
    _fetch_issues_for_export,
    _fetch_kris_for_export,
    _fetch_risks_for_export,
)
from .filters import (
    _filter_rows_by_final_scope,
    _filter_rows_by_control_criteria,
    _filter_rows_by_kri_criteria,
    _filter_rows_by_risk_criteria,
    _normalize_kri_status,
    _prefilter_department_id_for_as_of,
)
from .rehydrate import _rehydrate_department_names, _rehydrate_user_names
from .render import _render_export
from .rows import _control_to_row, _issue_to_row, _kri_to_row, _risk_to_row


def _apply_control_monitoring_rows(
    rows: list[dict[str, object]],
    *,
    config,
    as_of_date: date,
) -> list[dict[str, object]]:
    as_of_dt = _as_of_datetime(as_of_date)
    for row in rows:
        snapshot = derive_control_monitoring_snapshot(
            ControlMonitoringFacts(
                created_at=row.get("created_at"),
                latest_execution_result=row.get("latest_execution_result"),
                latest_executed_at=row.get("latest_executed_at"),
                execution_log_count=int(row.get("execution_log_count") or 0),
            ),
            config,
            now=as_of_dt,
        )
        row["monitoring_status"] = snapshot.monitoring_status.value
        row["monitoring_status_reason"] = snapshot.monitoring_status_reason.value
        row["latest_execution_result"] = snapshot.latest_execution_result
        row["latest_executed_at"] = snapshot.latest_executed_at
        row["days_since_last_execution"] = snapshot.days_since_last_execution
        row["execution_log_count"] = snapshot.execution_log_count
    return rows


def _apply_kri_monitoring_rows(
    rows: list[dict[str, object]],
    *,
    config,
    as_of_date: date,
) -> list[dict[str, object]]:
    for row in rows:
        snapshot = derive_kri_monitoring_snapshot(
            KRIMonitoringFacts(
                current_value=float(row.get("current_value") or 0),
                lower_limit=float(row.get("lower_limit") or 0),
                upper_limit=float(row.get("upper_limit") or 0),
                breach_status=str(row.get("breach_status") or "within"),
                frequency=str(row.get("frequency") or "quarterly"),
                last_period_end=row.get("last_period_end"),
                has_submission_history=bool(row.get("last_period_end")),
            ),
            config,
            today=as_of_date,
        )
        row["monitoring_status"] = snapshot.monitoring_status.value
        row["monitoring_status_reason"] = snapshot.monitoring_status_reason.value
        row["required_period_end"] = snapshot.required_period_end
        row["required_due_date"] = snapshot.required_due_date
        row["days_overdue"] = snapshot.days_overdue
        row["warning_upper_margin_ratio"] = snapshot.warning_upper_margin_ratio
    return rows


async def _export_issues(
    *,
    db: AsyncSession,
    current_user: User,
    export_format: ExportFormat,
    as_of_date: date,
    department_id: int | None,
    status_filter: IssueStatus | None,
    severity_filter: IssueSeverity | None,
    severity_group: Literal["high_critical"] | None,
    owner_user_id: int | None,
    overdue_only: bool,
    exclude_active_exceptions: bool,
) -> StreamingResponse:
    models = await _fetch_issues_for_export(
        db,
        current_user=current_user,
        department_id=department_id,
        status_filter=status_filter,
        severity_filter=severity_filter,
        severity_group=severity_group,
        owner_user_id=owner_user_id,
        exclude_active_exceptions=exclude_active_exceptions,
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
    fetch_department_id = _prefilter_department_id_for_as_of(as_of_date, department_id)
    models = await _fetch_risks_for_export(db, current_user=current_user, department_id=fetch_department_id)
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
    extra_visible_ids: set[int] = set()
    if department_id is None:
        extra_visible_ids.update(await get_risk_ids_where_kri_reporting_owner(db, current_user.id))
        extra_visible_ids.update(await get_risk_ids_where_control_owner(db, current_user.id))
    rows = _filter_rows_by_final_scope(
        rows,
        current_user=current_user,
        department_id=department_id,
        owner_field="owner_id",
        extra_visible_ids=extra_visible_ids,
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
    monitoring_status_filter: ControlMonitoringExportStatus | None,
    search: str | None,
) -> StreamingResponse:
    fetch_department_id = _prefilter_department_id_for_as_of(as_of_date, department_id)
    models = await _fetch_controls_for_export(db, current_user=current_user, department_id=fetch_department_id)
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
    control_monitoring_config = await get_control_monitoring_config(db)
    rows = _apply_control_monitoring_rows(rows, config=control_monitoring_config, as_of_date=as_of_date)
    rows = await _rehydrate_department_names(
        db,
        rows,
        department_id_field="department_id",
        department_name_field="department_name",
    )
    rows = _filter_rows_by_final_scope(
        rows,
        current_user=current_user,
        department_id=department_id,
        owner_field="control_owner_id",
    )
    rows = _filter_rows_by_control_criteria(
        rows,
        status_filter=status_filter,
        monitoring_status_filter=monitoring_status_filter,
        search=search,
    )

    headers = [
        "Name",
        "Description",
        "Department",
        "Owner",
        "Frequency",
        "Form",
        "Risk Level",
        "Status",
        "Monitoring Status",
        "Latest Execution Result",
        "Latest Executed At",
        "Days Since Last Execution",
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
            row.get("monitoring_status"),
            row.get("latest_execution_result"),
            row.get("latest_executed_at"),
            row.get("days_since_last_execution"),
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
    monitoring_status_filter: KRIMonitoringExportStatus | None,
    timeliness_status_filter: str | None,
    search: str | None,
) -> StreamingResponse:
    fetch_department_id = _prefilter_department_id_for_as_of(as_of_date, department_id)
    models = await _fetch_kris_for_export(db, current_user=current_user, department_id=fetch_department_id)
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
    kri_monitoring_config = await get_kri_monitoring_config(db)
    rows = _apply_kri_monitoring_rows(rows, config=kri_monitoring_config, as_of_date=as_of_date)
    rows = _filter_rows_by_final_scope(
        rows,
        current_user=current_user,
        department_id=department_id,
        owner_field="reporting_owner_id",
    )
    rows = _filter_rows_by_kri_criteria(
        rows,
        status_filter=status_filter,
        monitoring_status_filter=monitoring_status_filter,
        timeliness_status_filter=timeliness_status_filter,
        search=search,
        as_of_date=as_of_date,
    )

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
        "Monitoring Status",
        "Required Due Date",
        "Days Overdue",
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
            row.get("monitoring_status"),
            row.get("required_due_date"),
            row.get("days_overdue"),
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
