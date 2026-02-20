from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, User
from app.models.risk import ControlRiskLink
from app.services.report_service import generate_tabular_csv

from ._scoping import _user_has_no_departments, _validate_department_access
from ._streaming import ExportFormatQuery, _stream_binary, excel_export_removed, resolve_export_format

router = APIRouter()


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


def _execution_linked_risks(execution: ControlExecution) -> str:
    if not execution.control or not hasattr(execution.control, "risk_links"):
        return ""

    values: list[str] = []
    for link in execution.control.risk_links:
        risk = getattr(link, "risk", None)
        if not risk:
            continue
        display_name = (risk.name or risk.process or "").strip()
        values.append(f"R-{risk.id}: {display_name[:30]}" if display_name else f"R-{risk.id}")
    return "; ".join(values)


def _to_csv_rows(executions: list[ControlExecution]) -> tuple[list[str], list[list[object]]]:
    headers = [
        "ID",
        "Executed At",
        "Control ID",
        "Control Name",
        "Department",
        "Executor",
        "Result",
        "Findings",
        "Evidence Reference",
        "Notes",
        "Next Scheduled",
        "Linked Risks",
    ]

    rows = [
        [
            execution.id,
            execution.executed_at.strftime("%Y-%m-%d %H:%M") if execution.executed_at else "",
            execution.control_id,
            execution.control.name if execution.control else "",
            execution.control.department.name if execution.control and execution.control.department else "",
            execution.executed_by.name if execution.executed_by else "",
            execution.result or "",
            execution.findings or "",
            execution.evidence_reference or "",
            execution.notes or "",
            execution.next_scheduled.strftime("%Y-%m-%d") if execution.next_scheduled else "",
            _execution_linked_risks(execution),
        ]
        for execution in executions
    ]
    return headers, rows


@router.get("/audit-trail/excel")
async def download_audit_trail_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    raise excel_export_removed(replacement="/api/v1/reports/audit-trail/export?format=csv")


@router.get("/audit-trail/export")
async def download_audit_trail_export(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    result: Optional[str] = Query(None, description="Filter by result (passed/failed/warning)"),
    control_id: Optional[int] = Query(None, description="Filter by control"),
    from_date: Optional[datetime] = Query(None, description="Filter from date"),
    to_date: Optional[datetime] = Query(None, description="Filter to date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/audit-trail/export?format=csv")
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)

    executions: list[ControlExecution] = []
    if not _user_has_no_departments(dept_ids):
        query = _audit_trail_query(dept_ids, department_id, result, control_id, from_date, to_date)
        result_set = await db.execute(query)
        executions = list(result_set.scalars().all())

    headers, rows = _to_csv_rows(executions)
    return _stream_binary(
        filename_base="audit-trail",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, rows),
        as_of_date=datetime.now(UTC).date(),
    )
