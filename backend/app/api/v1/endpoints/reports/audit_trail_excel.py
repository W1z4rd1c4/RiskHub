from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import UtcAwareDatetime, coerce_utc
from app.core.permissions import control_visibility_clause, visible_risk_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, User
from app.models.risk import ControlRiskLink
from app.schemas.execution import ExecutionResultEnum
from app.services.report_service import generate_tabular_csv

from ._export_context import ReportExportContext, build_report_export_context
from ._streaming import (
    EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE,
    ExportFormatQuery,
    _stream_binary,
    excel_export_removed,
    resolve_export_format,
)

router = APIRouter()


def _audit_trail_query(
    context: ReportExportContext,
    result_filter: Optional[ExecutionResultEnum],
    control_id: Optional[int],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
) -> Select:
    from_date = coerce_utc(from_date)
    to_date = coerce_utc(to_date)

    query = (
        select(ControlExecution)
        .join(Control, ControlExecution.control_id == Control.id)
        .options(
            selectinload(ControlExecution.control).selectinload(Control.department),
            selectinload(ControlExecution.control).selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            selectinload(ControlExecution.executed_by),
        )
    )

    visibility_clause = control_visibility_clause(context.current_user, department_id=context.department_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    if result_filter:
        query = query.where(ControlExecution.result == result_filter)
    if control_id:
        query = query.where(ControlExecution.control_id == control_id)
    if from_date:
        query = query.where(ControlExecution.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecution.executed_at <= to_date)

    return query.order_by(ControlExecution.executed_at.desc(), ControlExecution.id.desc())


def _execution_candidate_risk_ids(executions: list[ControlExecution]) -> set[int]:
    return {
        risk.id
        for execution in executions
        if execution.control and hasattr(execution.control, "risk_links")
        for link in execution.control.risk_links
        if (risk := getattr(link, "risk", None)) is not None
    }


def _execution_linked_risks(execution: ControlExecution, visible_linked_risk_ids: set[int]) -> str:
    if not execution.control or not hasattr(execution.control, "risk_links"):
        return ""

    values: list[str] = []
    for link in execution.control.risk_links:
        risk = getattr(link, "risk", None)
        if not risk:
            continue
        if risk.id not in visible_linked_risk_ids:
            continue
        display_name = (risk.name or risk.process or "").strip()
        values.append(f"R-{risk.id}: {display_name[:30]}" if display_name else f"R-{risk.id}")
    return "; ".join(values)


async def _to_csv_rows(
    db: AsyncSession,
    current_user: User,
    executions: list[ControlExecution],
) -> tuple[list[str], list[list[object]]]:
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
    visible_linked_risk_ids = await visible_risk_ids(db, current_user, _execution_candidate_risk_ids(executions))

    rows = []
    for execution in executions:
        rows.append(
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
                _execution_linked_risks(execution, visible_linked_risk_ids),
            ]
        )
    return headers, rows


@router.get("/audit-trail/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_audit_trail_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    current_user: User = Depends(require_permission("reports", "read")),
):
    build_report_export_context(current_user=current_user, department_id=department_id)
    raise excel_export_removed(replacement="/api/v1/reports/audit-trail/export?format=csv")


@router.get("/audit-trail/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_audit_trail_export(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    result: Optional[ExecutionResultEnum] = Query(None, description="Filter by result"),
    control_id: Optional[int] = Query(None, description="Filter by control"),
    from_date: UtcAwareDatetime | None = Query(None, description="Filter from date"),
    to_date: UtcAwareDatetime | None = Query(None, description="Filter to date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/audit-trail/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id)

    executions: list[ControlExecution] = []
    if not context.empty_scope:
        query = _audit_trail_query(context, result, control_id, from_date, to_date)
        result_set = await db.execute(query)
        executions = list(result_set.scalars().all())

    headers, rows = await _to_csv_rows(db, current_user, executions)
    return _stream_binary(
        filename_base="audit-trail",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, rows),
        as_of_date=context.export_date,
    )
