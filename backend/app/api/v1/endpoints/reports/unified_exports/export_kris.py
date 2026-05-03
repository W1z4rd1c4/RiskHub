from datetime import date

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_risk_ids_where_control_owner, get_risk_ids_where_kri_reporting_owner
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
from app.services._reporting.exports import ExportRow, ReportExportDefinition, render_report_export_definition
from .rehydrate import _rehydrate_department_names, _rehydrate_user_names
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

    async def apply_monitoring(current_rows: list[ExportRow]) -> list[ExportRow]:
        kri_monitoring_config = await get_kri_monitoring_config(db)
        return _apply_kri_monitoring_rows(current_rows, config=kri_monitoring_config, as_of_date=as_of_date)

    async def apply_final_scope(current_rows: list[ExportRow]) -> list[ExportRow]:
        extra_visible_risk_ids: set[int] = set()
        if department_id is None:
            extra_visible_risk_ids.update(await get_risk_ids_where_kri_reporting_owner(db, current_user.id))
            extra_visible_risk_ids.update(await get_risk_ids_where_control_owner(db, current_user.id))
        return _filter_rows_by_final_scope(
            current_rows,
            current_user=current_user,
            department_id=department_id,
            owner_field="risk_owner_id",
            extra_visible_ids=extra_visible_risk_ids,
            extra_visible_id_field="risk_id",
        )

    definition = ReportExportDefinition(
        title=f"KRI Export (as of {as_of_date.isoformat()})",
        sheet_name="KRIs",
        filename_base="kris",
        headers=[
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
        ],
        stages=(
            lambda current_rows: ExportSnapshotService.apply_as_of_snapshot(
                db,
                rows=current_rows,
                entity_type=ActivityEntityType.KRI,
                as_of_date=as_of_date,
            ),
            _normalize_kri_status,
            lambda current_rows: _rehydrate_user_names(
                db,
                current_rows,
                user_id_field="reporting_owner_id",
                user_name_field="reporting_owner_name",
            ),
            lambda current_rows: _rehydrate_department_names(
                db,
                current_rows,
                department_id_field="department_id",
                department_name_field="department_name",
            ),
            lambda current_rows: _apply_kri_history_as_of(db, current_rows, as_of_date),
            apply_monitoring,
            apply_final_scope,
            lambda current_rows: _filter_rows_by_kri_criteria(
                current_rows,
                status_filter=status_filter,
                monitoring_status_filter=monitoring_status_filter,
                timeliness_status_filter=timeliness_status_filter,
                search=search,
                as_of_date=as_of_date,
            ),
        ),
        row_values=lambda row: [
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
        ],
    )

    return await render_report_export_definition(
        definition=definition,
        export_format=export_format,
        as_of_date=as_of_date,
        rows=rows,
    )
