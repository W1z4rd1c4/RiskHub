from datetime import date

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.activity_log import ActivityEntityType
from app.services._monitoring_status import get_kri_monitoring_config
from app.services.export_snapshot_service import ExportSnapshotService

from ._shared import ExportFormat, KRIExportStatus, KRIMonitoringExportStatus
from .export_monitoring import _apply_kri_monitoring_rows
from .fetch import _apply_kri_history_as_of, _fetch_kris_for_export
from .filters import (
    _filter_rows_by_final_scope,
    _filter_rows_by_kri_criteria,
    _normalize_kri_status,
    _prefilter_department_id_for_as_of,
)
from .rehydrate import _rehydrate_department_names, _rehydrate_user_names
from .render import _render_export
from .rows import _kri_to_row


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
