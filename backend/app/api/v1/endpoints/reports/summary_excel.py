from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, Risk, User
from app.services.report_service import generate_tabular_excel

from ._scoping import _user_has_no_departments, _validate_department_access
from ._streaming import _stream_binary

router = APIRouter()


@router.get("/summary/excel")
async def download_summary_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    """Download dashboard summary as Excel. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)

    summary: dict[str, Any] = {
        "total_controls": 0,
        "total_risks": 0,
        "critical_risks_count": 0,
        "average_net_risk_score": 0,
        "controls_by_status": {},
    }

    if not _user_has_no_departments(dept_ids):
        controls_query = select(Control)
        risks_query = select(Risk)

        if dept_ids is not None:
            controls_query = controls_query.where(Control.department_id.in_(dept_ids))
            risks_query = risks_query.where(Risk.department_id.in_(dept_ids))

        if department_id:
            controls_query = controls_query.where(Control.department_id == department_id)
            risks_query = risks_query.where(Risk.department_id == department_id)

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

    return _stream_binary(
        filename_base="dashboard-summary",
        export_format="xlsx",
        content_bytes=generate_tabular_excel("Dashboard Summary", headers, rows),
        as_of_date=datetime.now(UTC).date(),
    )
