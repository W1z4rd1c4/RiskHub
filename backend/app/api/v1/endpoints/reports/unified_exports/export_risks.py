from datetime import date

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_risk_ids_where_control_owner, get_risk_ids_where_kri_reporting_owner
from app.models import User
from app.models.activity_log import ActivityEntityType
from app.services.export_snapshot_service import ExportSnapshotService

from ._shared import ExportFormat
from .fetch import _fetch_risks_for_export
from .filters import (
    _filter_rows_by_final_scope,
    _filter_rows_by_risk_criteria,
    _prefilter_department_id_for_as_of,
)
from .rehydrate import _rehydrate_department_names, _rehydrate_user_names
from .render import _render_export
from .rows import _risk_to_row


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
