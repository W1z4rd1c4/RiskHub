from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.permissions import can_view_risk_committee, get_user_department_ids, has_permission
from app.core.security import require_permission
from app.core.ttl_cache import TTLCache
from app.db.session import get_db
from app.models import User
from app.schemas.dashboard import DashboardOverviewCapabilities, DashboardOverviewResponse

from .controls import build_control_trends
from .departments import get_department_metrics
from .issues_metrics import get_issue_aging, get_issue_summary, get_issues_by_severity
from .kris import get_kri_breach_trends
from .risks import get_risk_distribution, get_risk_trends
from .summary import get_dashboard_summary

router = APIRouter()

DASHBOARD_OVERVIEW_CACHE = TTLCache[dict](ttl_seconds=15, max_entries=500)


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    control_status: Optional[str] = Query(None, description="Filter by control status"),
    control_form: Optional[str] = Query(None, description="Filter by control form"),
    risk_level: Optional[Literal["critical", "high", "medium", "low"]] = Query(
        None, description="Filter by risk level"
    ),
    include_archived: bool = Query(False, description="Include archived items"),
):
    cache_key = (
        current_user.id,
        getattr(current_user.access_scope, "value", str(current_user.access_scope)),
        current_user.department_id,
        getattr(getattr(current_user, "role", None), "name", None),
        department_id,
        control_status,
        control_form,
        risk_level,
        include_archived,
    )
    cached = DASHBOARD_OVERVIEW_CACHE.get(cache_key)
    if cached is not None:
        return DashboardOverviewResponse(**cached)

    summary = await get_dashboard_summary(
        db=db,
        current_user=current_user,
        department_id=department_id,
        control_status=control_status,
        control_form=control_form,
        risk_level=risk_level,
        include_archived=include_archived,
    )
    department_metrics = await get_department_metrics(
        db=db,
        current_user=current_user,
        department_id=department_id,
        include_archived=include_archived,
    )
    gross_distribution = await get_risk_distribution(
        db=db,
        current_user=current_user,
        department_id=department_id,
        risk_level=risk_level,
        risk_type="gross",
        include_archived=include_archived,
    )
    net_distribution = await get_risk_distribution(
        db=db,
        current_user=current_user,
        department_id=department_id,
        risk_level=risk_level,
        risk_type="net",
        include_archived=include_archived,
    )
    control_trends = await build_control_trends(
        db=db,
        current_user=current_user,
        department_id=department_id,
        control_status=control_status,
    )
    risk_trends = await get_risk_trends(
        db=db,
        current_user=current_user,
        department_id=department_id,
        include_archived=include_archived,
    )
    kri_breach_trends = await get_kri_breach_trends(
        db=db,
        current_user=current_user,
        department_id=department_id,
    )

    issue_summary = None
    issue_aging = None
    issue_severity = None
    if has_permission(current_user, "issues", "read"):
        issue_summary = await get_issue_summary(db=db, current_user=current_user, department_id=department_id)
        issue_aging = await get_issue_aging(db=db, current_user=current_user, department_id=department_id)
        issue_severity = await get_issues_by_severity(db=db, current_user=current_user, department_id=department_id)

    payload = {
        "summary": summary.model_dump(),
        "department_metrics": [item.model_dump() for item in department_metrics],
        "gross_distribution": gross_distribution.model_dump(),
        "net_distribution": net_distribution.model_dump(),
        "control_trends": [item.model_dump() for item in control_trends],
        "risk_trends": [item.model_dump() for item in risk_trends],
        "kri_breach_trends": [item.model_dump() for item in kri_breach_trends],
        "issue_summary": issue_summary.model_dump() if issue_summary is not None else None,
        "issue_aging": issue_aging.model_dump() if issue_aging is not None else None,
        "issue_severity": issue_severity.model_dump() if issue_severity is not None else None,
        "generated_at": utc_now().isoformat(),
        "capabilities": DashboardOverviewCapabilities(
            can_read=True,
            can_view_issue_metrics=has_permission(current_user, "issues", "read"),
            can_view_committee=can_view_risk_committee(current_user) and has_permission(current_user, "risks", "read"),
            can_view_vendor_metrics=has_permission(current_user, "vendors", "read"),
            can_use_department_filter=get_user_department_ids(current_user) is None,
            can_export_or_report=has_permission(current_user, "reports", "read"),
        ).model_dump(),
    }
    return DashboardOverviewResponse(**DASHBOARD_OVERVIEW_CACHE.set(cache_key, payload))
