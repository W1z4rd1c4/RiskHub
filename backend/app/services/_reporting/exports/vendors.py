from datetime import date

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.activity_log import ActivityEntityType
from app.services.export_snapshot_service import ExportSnapshotService

from .fetch import _fetch_vendors_for_export
from .filters import _filter_rows_by_final_scope, _filter_rows_by_vendor_criteria, _prefilter_department_id_for_as_of
from .lifecycle import ExportRow, ReportExportDefinition, render_report_export_definition
from .rehydrate import _rehydrate_department_names, _rehydrate_user_names
from .rows import _vendor_to_row
from .shared import ExportFormat


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
    fetch_department_id = _prefilter_department_id_for_as_of(as_of_date, department_id)
    models = await _fetch_vendors_for_export(db, current_user=current_user, department_id=fetch_department_id)
    rows = [_vendor_to_row(vendor) for vendor in models]

    definition = ReportExportDefinition(
        title=f"Vendor Export (as of {as_of_date.isoformat()})",
        sheet_name="Vendors",
        filename_base="vendors",
        headers=[
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
        ],
        stages=(
            lambda current: ExportSnapshotService.apply_as_of_snapshot(
                db,
                rows=current,
                entity_type=ActivityEntityType.VENDOR,
                as_of_date=as_of_date,
            ),
            lambda current: _rehydrate_user_names(
                db,
                current,
                user_id_field="outsourcing_owner_user_id",
                user_name_field="owner_name",
            ),
            lambda current: _rehydrate_department_names(
                db,
                current,
                department_id_field="department_id",
                department_name_field="department_name",
            ),
            lambda current: _filter_rows_by_final_scope(
                current,
                current_user=current_user,
                department_id=department_id,
                owner_field="outsourcing_owner_user_id",
                exclude_unassigned_for_scoped=True,
            ),
            lambda current: _filter_rows_by_vendor_criteria(
                current,
                status_filter=status_filter,
                search=search,
                vendor_type=vendor_type,
            ),
        ),
        row_values=_vendor_row_values,
    )

    return await render_report_export_definition(
        definition=definition,
        export_format=export_format,
        as_of_date=as_of_date,
        rows=rows,
    )


def _vendor_row_values(row: ExportRow) -> list[object]:
    return [
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
