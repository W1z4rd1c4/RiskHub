from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import control_visibility_clause, risk_visibility_clause
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, Risk, User
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
    context: ReportExportContext,
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

        from app.models.global_config import ConfigDefaults

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


@router.get("/summary/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_summary_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    current_user: User = Depends(require_permission("reports", "read")),
):
    build_report_export_context(current_user=current_user, department_id=department_id)
    raise excel_export_removed(replacement="/api/v1/reports/summary/export?format=csv")


@router.get("/summary/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_summary_export(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/summary/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id)
    headers, rows = await _build_summary_payload(db=db, context=context)
    return _stream_binary(
        filename_base="dashboard-summary",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, rows),
        as_of_date=context.export_date,
    )
