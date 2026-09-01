from __future__ import annotations

from datetime import date, datetime
from typing import Any, Protocol

from fastapi.responses import StreamingResponse
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import UtcAwareDatetime, coerce_utc, utc_now
from app.core.permissions import control_visibility_clause, has_permission, visible_risk_ids
from app.models import Control, ControlExecution, Department, User
from app.models.risk import ControlRiskLink
from app.schemas.dashboard import DashboardSummaryResponse
from app.schemas.execution import ExecutionResultEnum
from app.services._dashboard_metrics import build_dashboard_summary_metrics
from app.services._reporting.exports.pipeline import _stream_binary
from app.services._reporting.exports.shared import ExportFormat
from app.services._reporting.tabular import generate_tabular_csv


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


def _build_summary_rows(
    summary: DashboardSummaryResponse,
    *,
    generated_at: datetime,
    department_label: str,
    control_status: str | None,
    control_form: str | None,
    risk_level: str | None,
    include_archived: bool,
    can_view_controls: bool,
    can_view_risks: bool,
    can_view_vendors: bool,
) -> tuple[list[str], list[list[Any]]]:
    headers = ["Metric", "Value"]
    rows: list[list[Any]] = [
        ["Generated At", generated_at.isoformat()],
        [
            "Scope",
            (
                "Actor-visible Dashboard records in the selected Department"
                if department_label != "All actor-visible Departments"
                else "All actor-visible Dashboard records"
            ),
        ],
        ["Filter: Department", department_label],
    ]

    if can_view_risks:
        rows.extend(
            [
                ["Filter: Risk Level", risk_level or "all"],
                ["Applies to: Risk Level", "Risk metrics only"],
            ]
        )
    if can_view_controls:
        rows.extend(
            [
                ["Filter: Control Status", control_status or "all"],
                ["Applies to: Control Status", "Control metrics only"],
                ["Filter: Control Form", control_form or "all"],
                ["Applies to: Control Form", "Control metrics only"],
            ]
        )
    rows.append(["Unaffected by Risk/Control Filters", "Vendor metrics"])
    rows.append(["Filter: Archived Records", "included" if include_archived else "excluded"])

    if can_view_risks:
        rows.extend(
            [
                ["Critical Risk Threshold", summary.risk_thresholds.critical],
                ["High Risk Threshold", summary.risk_thresholds.high],
                ["Medium Risk Threshold", summary.risk_thresholds.medium],
            ]
        )
    if can_view_controls:
        rows.append(["Total Controls", summary.total_controls])
    if can_view_risks:
        rows.extend(
            [
                ["Total Risks", summary.total_risks],
                ["Critical Risks", summary.critical_risks_count],
                ["Average Net Risk Score", str(summary.average_net_risk_score)],
            ]
        )
    if can_view_vendors:
        rows.extend(
            [
                ["Total Vendors", summary.total_vendors],
                ["High-risk Vendors", summary.high_risk_vendors_count],
            ]
        )

    if can_view_controls:
        for heading, breakdown in (
            ("Controls by Status", summary.controls_by_status),
            ("Controls by Form", summary.controls_by_form),
            ("Controls by Frequency", summary.controls_by_frequency),
        ):
            if breakdown:
                rows.append(["", ""])
                rows.append([heading, ""])
                for value, count in breakdown.items():
                    rows.append([str(value).replace("_", " ").title(), count])
    return headers, rows


async def build_summary_export(
    *,
    db: AsyncSession,
    context: ReportExportContextLike,
    export_format: ExportFormat,
    control_status: str | None = None,
    control_form: str | None = None,
    risk_level: str | None = None,
    include_archived: bool = False,
) -> StreamingResponse:
    generated_at = utc_now()
    summary = await build_dashboard_summary_metrics(
        db=db,
        current_user=context.current_user,
        department_id=context.department_id,
        control_status=control_status,
        control_form=control_form,
        risk_level=risk_level,
        include_archived=include_archived,
    )
    department_label = "All actor-visible Departments"
    if context.department_id is not None:
        department_label = "Unknown department"
        department = await db.scalar(select(Department).where(Department.id == context.department_id))
        if department is not None:
            department_label = f"{department.code} — {department.name}"
    headers, rows = _build_summary_rows(
        summary,
        generated_at=generated_at,
        department_label=department_label,
        control_status=control_status,
        control_form=control_form,
        risk_level=risk_level,
        include_archived=include_archived,
        can_view_controls=has_permission(context.current_user, "controls", "read"),
        can_view_risks=has_permission(context.current_user, "risks", "read"),
        can_view_vendors=has_permission(context.current_user, "vendors", "read"),
    )
    return _stream_binary(
        filename_base="dashboard-summary",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, rows),
        as_of_date=context.export_date,
    )
