from datetime import date

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.activity_log import ActivityEntityType
from app.services.export_snapshot_service import ExportSnapshotService

from ._shared import ExportFormat
from .fetch import _fetch_vendors_for_export
from .filters import _filter_rows_by_final_scope, _filter_rows_by_vendor_criteria, _prefilter_department_id_for_as_of
from .rehydrate import _rehydrate_department_names, _rehydrate_user_names
from .render import _render_export
from .rows import _vendor_to_row


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
    rows = _filter_rows_by_final_scope(
        rows,
        current_user=current_user,
        department_id=department_id,
        owner_field="outsourcing_owner_user_id",
        exclude_unassigned_for_scoped=True,
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
