from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import get_issue_scope_clause
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Issue, User
from app.models.issue import IssueSeverity, IssueStatus
from app.schemas.dashboard import (
    IssueAgingBucket,
    IssueAgingResponse,
    IssueDashboardSummaryResponse,
    IssueSeverityBreakdownItem,
    IssueSeverityBreakdownResponse,
)
from app.services.issue_visibility_service import issue_has_active_approved_exception

router = APIRouter()


def _issue_age_days(issue: Issue, now: datetime) -> int:
    opened_at = coerce_utc(issue.opened_at)
    if opened_at is None:
        return 0
    delta = now - opened_at
    return max(delta.days, 0)


async def _load_scoped_issues(
    db: AsyncSession,
    current_user: User,
    *,
    department_id: int | None,
) -> list[Issue]:
    query = select(Issue).options(selectinload(Issue.exceptions))
    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)
    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    result = await db.execute(query)
    return list(result.scalars().all())


def _open_unsuppressed_issues(issues: list[Issue], now: datetime) -> list[Issue]:
    return [
        issue
        for issue in issues
        if issue.status != IssueStatus.closed.value and not issue_has_active_approved_exception(issue, now)
    ]


@router.get("/issues-summary", response_model=IssueDashboardSummaryResponse)
async def get_issue_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueDashboardSummaryResponse:
    now = utc_now()
    issues = await _load_scoped_issues(db, current_user, department_id=department_id)
    open_issues = _open_unsuppressed_issues(issues, now)
    overdue = []
    for issue in open_issues:
        due_at = coerce_utc(issue.due_at)
        if due_at is not None and due_at < now:
            overdue.append(issue)
    high_severity = [
        issue for issue in open_issues if issue.severity in (IssueSeverity.high.value, IssueSeverity.critical.value)
    ]

    ages = sorted(_issue_age_days(issue, now) for issue in open_issues)
    if not ages:
        median_days_open = 0
    elif len(ages) % 2 == 1:
        median_days_open = ages[len(ages) // 2]
    else:
        mid = len(ages) // 2
        median_days_open = (ages[mid - 1] + ages[mid]) // 2

    return IssueDashboardSummaryResponse(
        open_issues=len(open_issues),
        overdue_issues=len(overdue),
        high_severity_open=len(high_severity),
        median_days_open=median_days_open,
    )


@router.get("/issues-aging", response_model=IssueAgingResponse)
async def get_issue_aging(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueAgingResponse:
    now = utc_now()
    issues = await _load_scoped_issues(db, current_user, department_id=department_id)
    open_issues = _open_unsuppressed_issues(issues, now)

    buckets: dict[str, int] = {"0-7": 0, "8-30": 0, "31-60": 0, "61+": 0}
    for issue in open_issues:
        age_days = _issue_age_days(issue, now)
        if age_days <= 7:
            buckets["0-7"] += 1
        elif age_days <= 30:
            buckets["8-30"] += 1
        elif age_days <= 60:
            buckets["31-60"] += 1
        else:
            buckets["61+"] += 1

    return IssueAgingResponse(
        buckets=[
            IssueAgingBucket(bucket="0-7", count=buckets["0-7"]),
            IssueAgingBucket(bucket="8-30", count=buckets["8-30"]),
            IssueAgingBucket(bucket="31-60", count=buckets["31-60"]),
            IssueAgingBucket(bucket="61+", count=buckets["61+"]),
        ]
    )


@router.get("/issues-by-severity", response_model=IssueSeverityBreakdownResponse)
async def get_issues_by_severity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueSeverityBreakdownResponse:
    now = utc_now()
    issues = await _load_scoped_issues(db, current_user, department_id=department_id)
    open_issues = _open_unsuppressed_issues(issues, now)

    counts = {severity.value: 0 for severity in IssueSeverity}
    for issue in open_issues:
        if issue.severity in counts:
            counts[issue.severity] += 1

    return IssueSeverityBreakdownResponse(
        items=[
            IssueSeverityBreakdownItem(severity=IssueSeverity.low.value, count=counts[IssueSeverity.low.value]),
            IssueSeverityBreakdownItem(severity=IssueSeverity.medium.value, count=counts[IssueSeverity.medium.value]),
            IssueSeverityBreakdownItem(severity=IssueSeverity.high.value, count=counts[IssueSeverity.high.value]),
            IssueSeverityBreakdownItem(
                severity=IssueSeverity.critical.value, count=counts[IssueSeverity.critical.value]
            ),
        ]
    )
