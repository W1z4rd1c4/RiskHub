from __future__ import annotations

from datetime import date, datetime
from typing import Any, Protocol

from fastapi.responses import StreamingResponse
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import UtcAwareDatetime, coerce_utc
from app.core.permissions import control_visibility_clause, risk_visibility_clause, visible_risk_ids
from app.models import Control, ControlExecution, Risk, User
from app.models.global_config import ConfigDefaults
from app.models.risk import ControlRiskLink
from app.schemas.execution import ExecutionResultEnum
from app.services._reporting.exports.pipeline import _stream_binary
from app.services._reporting.exports.shared import ExportFormat
from app.services.report_service import generate_tabular_csv


class ReportExportContextLike(Protocol):
    @property
    def current_user(self) -> User: ...

    @property
    def department_id(self) -> int | None: ...

    @property
    def export_date(self) -> date: ...

    @property
    def empty_scope(self) -> bool: ...


def _audit_trail_query(
    context: ReportExportContextLike,
    result_filter: ExecutionResultEnum | None,
    control_id: int | None,
    from_date: datetime | None,
    to_date: datetime | None,
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


async def _to_audit_trail_csv_rows(
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


async def build_audit_trail_export(
    *,
    db: AsyncSession,
    current_user: User,
    context: ReportExportContextLike,
    export_format: ExportFormat,
    result_filter: ExecutionResultEnum | None,
    control_id: int | None,
    from_date: UtcAwareDatetime | None,
    to_date: UtcAwareDatetime | None,
) -> StreamingResponse:
    executions: list[ControlExecution] = []
    if not context.empty_scope:
        query = _audit_trail_query(context, result_filter, control_id, from_date, to_date)
        result_set = await db.execute(query)
        executions = list(result_set.scalars().all())

    headers, rows = await _to_audit_trail_csv_rows(db, current_user, executions)
    return _stream_binary(
        filename_base="audit-trail",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, rows),
        as_of_date=context.export_date,
    )


def _build_summary_rows(summary: dict[str, Any]) -> tuple[list[str], list[list[Any]]]:
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
    return headers, rows


async def _build_summary_payload(
    *,
    db: AsyncSession,
    context: ReportExportContextLike,
) -> tuple[list[str], list[list[Any]]]:
    summary: dict[str, Any] = {
        "total_controls": 0,
        "total_risks": 0,
        "critical_risks_count": 0,
        "average_net_risk_score": 0,
        "controls_by_status": {},
    }

    if not context.empty_scope:
        controls_query = select(Control)
        risks_query = select(Risk)

        control_scope = control_visibility_clause(context.current_user, department_id=context.department_id)
        risk_scope = await risk_visibility_clause(db, context.current_user, department_id=context.department_id)
        if control_scope is not None:
            controls_query = controls_query.where(control_scope)
        if risk_scope is not None:
            risks_query = risks_query.where(risk_scope)

        controls_result = await db.execute(controls_query)
        controls = controls_result.scalars().all()

        risks_result = await db.execute(risks_query)
        risks = risks_result.scalars().all()

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

    return _build_summary_rows(summary)


async def build_summary_export(
    *,
    db: AsyncSession,
    context: ReportExportContextLike,
    export_format: ExportFormat,
) -> StreamingResponse:
    headers, rows = await _build_summary_payload(db=db, context=context)
    return _stream_binary(
        filename_base="dashboard-summary",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, rows),
        as_of_date=context.export_date,
    )
