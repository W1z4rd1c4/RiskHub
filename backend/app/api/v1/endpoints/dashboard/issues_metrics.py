from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.dashboard import (
    IssueAgingResponse,
    IssueDashboardSummaryResponse,
    IssueSeverityBreakdownResponse,
)
from app.services._dashboard_metrics.issues import (
    build_issue_aging_metrics,
    build_issue_severity_metrics,
    build_issue_summary_metrics,
)

router = APIRouter()


@router.get("/issues-summary", response_model=IssueDashboardSummaryResponse)
async def get_issue_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueDashboardSummaryResponse:
    return await build_issue_summary_metrics(db=db, current_user=current_user, department_id=department_id)


@router.get("/issues-aging", response_model=IssueAgingResponse)
async def get_issue_aging(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueAgingResponse:
    return await build_issue_aging_metrics(db=db, current_user=current_user, department_id=department_id)


@router.get("/issues-by-severity", response_model=IssueSeverityBreakdownResponse)
async def get_issues_by_severity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueSeverityBreakdownResponse:
    return await build_issue_severity_metrics(db=db, current_user=current_user, department_id=department_id)
