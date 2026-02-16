from datetime import UTC, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import get_issue_scope_clause
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Issue, IssueLink, User
from app.models.issue import IssueSeverity, IssueStatus
from app.schemas.issue import IssueListResponse
from app.services.issue_visibility_service import unsuppressed_issue_clause

from .._shared import _serialize_issue_summary

router = APIRouter()


@router.get("/issues", response_model=IssueListResponse)
async def list_issues(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[IssueStatus] = None,
    severity: Optional[IssueSeverity] = None,
    severity_group: Optional[Literal["high_critical"]] = Query(None),
    owner_user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    overdue: Optional[bool] = None,
    exclude_active_exceptions: bool = Query(False),
    linked_risk_id: Optional[int] = None,
    linked_control_id: Optional[int] = None,
    linked_vendor_id: Optional[int] = None,
    search: Optional[str] = Query(None),
    include_closed: bool = Query(True),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query(None),
) -> IssueListResponse:
    query = select(Issue)
    now = datetime.now(UTC)
    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)

    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    if status is not None:
        query = query.where(Issue.status == status.value)
    if severity_group == "high_critical":
        query = query.where(Issue.severity.in_((IssueSeverity.high.value, IssueSeverity.critical.value)))
    elif severity is not None:
        query = query.where(Issue.severity == severity.value)
    if owner_user_id is not None:
        query = query.where(Issue.owner_user_id == owner_user_id)
    if exclude_active_exceptions:
        query = query.where(unsuppressed_issue_clause(now))
    if not include_closed:
        query = query.where(Issue.status != IssueStatus.closed.value)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Issue.title.ilike(pattern), Issue.description.ilike(pattern)))

    if overdue is True:
        query = query.where(
            and_(
                Issue.due_at.is_not(None),
                Issue.due_at < now,
                Issue.status != IssueStatus.closed.value,
            )
        )
    if overdue is False:
        query = query.where(or_(Issue.due_at.is_(None), Issue.due_at >= now, Issue.status == IssueStatus.closed.value))
    if linked_risk_id is not None:
        query = query.where(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.risk_id == linked_risk_id)))
    if linked_control_id is not None:
        query = query.where(
            Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.control_id == linked_control_id))
        )
    if linked_vendor_id is not None:
        query = query.where(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.vendor_id == linked_vendor_id)))

    sortable_fields = {
        "title": Issue.title,
        "severity": Issue.severity,
        "status": Issue.status,
        "opened_at": Issue.opened_at,
        "due_at": Issue.due_at,
        "updated_at": Issue.updated_at,
        "created_at": Issue.created_at,
    }
    if sort_by is not None and sort_by not in sortable_fields:
        raise HTTPException(status_code=400, detail="Invalid sort_by value")
    if sort_order is not None and sort_order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="Invalid sort_order value")

    if sort_by is not None:
        direction = sort_order or "asc"
        order_expr = sortable_fields[sort_by].asc() if direction == "asc" else sortable_fields[sort_by].desc()
        if sort_by == "due_at":
            order_expr = order_expr.nullslast()
        query = query.order_by(order_expr, Issue.id.desc())
    else:
        query = query.order_by(Issue.opened_at.desc(), Issue.id.desc())

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    result = await db.execute(
        query.options(
            selectinload(Issue.department),
            selectinload(Issue.owner),
        )
        .offset(skip)
        .limit(limit)
    )
    issues = result.scalars().all()

    return IssueListResponse(
        items=[_serialize_issue_summary(issue) for issue in issues],
        total=total,
        skip=skip,
        limit=limit,
    )
