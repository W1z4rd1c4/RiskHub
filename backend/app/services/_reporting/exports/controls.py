from datetime import date

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.activity_log import ActivityEntityType
from app.services._monitoring_status import get_control_monitoring_config
from app.services.export_snapshot_service import ExportSnapshotService

from .shared import ControlMonitoringExportStatus, ExportFormat
from .monitoring import _apply_control_monitoring_rows
from .fetch import _fetch_controls_for_export
from .filters import (
    _filter_rows_by_control_criteria,
    _filter_rows_by_final_scope,
    _prefilter_department_id_for_as_of,
)
from .lifecycle import ExportRow, ReportExportDefinition, render_report_export_definition
from .rehydrate import _rehydrate_department_names, _rehydrate_user_names
from .rows import _control_to_row


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

    async def apply_monitoring(current_rows: list[ExportRow]) -> list[ExportRow]:
        control_monitoring_config = await get_control_monitoring_config(db)
        return _apply_control_monitoring_rows(current_rows, config=control_monitoring_config, as_of_date=as_of_date)

    definition = ReportExportDefinition(
        title=f"Control Export (as of {as_of_date.isoformat()})",
        sheet_name="Controls",
        filename_base="controls",
        headers=[
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
        ],
        stages=(
            lambda current_rows: ExportSnapshotService.apply_as_of_snapshot(
                db,
                rows=current_rows,
                entity_type=ActivityEntityType.CONTROL,
                as_of_date=as_of_date,
            ),
            lambda current_rows: _rehydrate_user_names(
                db,
                current_rows,
                user_id_field="control_owner_id",
                user_name_field="control_owner_name",
            ),
            apply_monitoring,
            lambda current_rows: _rehydrate_department_names(
                db,
                current_rows,
                department_id_field="department_id",
                department_name_field="department_name",
            ),
            lambda current_rows: _filter_rows_by_final_scope(
                current_rows,
                current_user=current_user,
                department_id=department_id,
                owner_field="control_owner_id",
            ),
            lambda current_rows: _filter_rows_by_control_criteria(
                current_rows,
                status_filter=status_filter,
                monitoring_status_filter=monitoring_status_filter,
                search=search,
            ),
        ),
        row_values=lambda row: [
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
        ],
    )

    return await render_report_export_definition(
        definition=definition,
        export_format=export_format,
        as_of_date=as_of_date,
        rows=rows,
    )
