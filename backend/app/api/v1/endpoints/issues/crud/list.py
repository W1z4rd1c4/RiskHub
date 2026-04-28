from datetime import UTC, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    build_grouped_collection_page,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_literal,
    coerce_optional_string,
    merge_collection_filters,
    parse_collection_query,
)
from app.core.permissions import (
    can_read_control_id,
    can_read_risk_id,
    can_read_vendor_id,
    get_issue_scope_clause,
    has_permission,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, ControlRiskLink, Issue, IssueLink, KeyRiskIndicator, User
from app.models.issue import IssueSeverity, IssueStatus
from app.schemas.issue import IssueListResponse
from app.services.authorization_capabilities import issue_capabilities
from app.services.issue_visibility_service import unsuppressed_issue_clause

from .._shared import _serialize_issue_summary

router = APIRouter()

ISSUE_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
ISSUE_GROUP_UNCATEGORIZED = "__uncategorized__"
ISSUE_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
ISSUE_GROUP_NO_PROCESS = "__no_process__"
ISSUE_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"


def _issue_context_values(issue, *, group_by: str) -> set[str]:
    values: set[str] = set()
    for context in issue.risk_contexts or []:
        if group_by == "category":
            raw_value = context.risk_category
        elif group_by == "process":
            raw_value = context.risk_process
        elif group_by in {"risk_type", "type"}:
            raw_value = context.risk_type
        else:
            raw_value = None
        if raw_value and raw_value.strip():
            values.add(raw_value.strip())
    return values


def _issue_group_entries(issue, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "department":
        value = issue.department_name or ISSUE_GROUP_UNKNOWN_DEPARTMENT
        return [CollectionGroupEntry(value, value)]

    if group_by == "vendor":
        vendor_names = {
            context.vendor_name.strip()
            for context in issue.vendor_contexts or []
            if context.vendor_name and context.vendor_name.strip()
        }
        if not vendor_names:
            return [CollectionGroupEntry(ISSUE_GROUP_UNLINKED_VENDOR, ISSUE_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(name, name) for name in sorted(vendor_names)]

    values = _issue_context_values(issue, group_by=group_by)
    if values:
        return [CollectionGroupEntry(value, value) for value in sorted(values)]

    if group_by == "category":
        return [CollectionGroupEntry(ISSUE_GROUP_UNCATEGORIZED, ISSUE_GROUP_UNCATEGORIZED)]
    if group_by == "process":
        return [CollectionGroupEntry(ISSUE_GROUP_NO_PROCESS, ISSUE_GROUP_NO_PROCESS)]
    if group_by in {"risk_type", "type"}:
        return [CollectionGroupEntry(ISSUE_GROUP_UNKNOWN_RISK_TYPE, ISSUE_GROUP_UNKNOWN_RISK_TYPE)]
    return []


@router.get("/issues", response_model=IssueListResponse)
async def list_issues(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
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
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
) -> IssueListResponse:
    collection_query = parse_collection_query(
        offset=skip if skip is not None else offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=100,
    )
    filter_values = merge_collection_filters(
        collection_query,
        {
            "status": status.value if status else None,
            "severity": severity.value if severity else None,
            "severity_group": severity_group,
            "owner_user_id": owner_user_id,
            "department_id": department_id,
            "overdue": overdue,
            "exclude_active_exceptions": exclude_active_exceptions,
            "linked_risk_id": linked_risk_id,
            "linked_control_id": linked_control_id,
            "linked_vendor_id": linked_vendor_id,
            "search": search,
            "include_closed": include_closed,
        },
    )
    status_value = filter_values.get("status")
    status = coerce_optional_enum(IssueStatus, status_value, "status")
    severity_value = filter_values.get("severity")
    severity = coerce_optional_enum(IssueSeverity, severity_value, "severity")
    severity_group_filter = coerce_optional_literal(
        "severity_group", filter_values.get("severity_group"), {"high_critical"}
    )
    owner_user_id = coerce_optional_int("owner_user_id", filter_values.get("owner_user_id"))
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    overdue = coerce_optional_bool("overdue", filter_values.get("overdue"))
    exclude_active_exceptions_filter = (
        coerce_optional_bool("exclude_active_exceptions", filter_values.get("exclude_active_exceptions")) or False
    )
    linked_risk_id = coerce_optional_int("linked_risk_id", filter_values.get("linked_risk_id"))
    linked_control_id = coerce_optional_int("linked_control_id", filter_values.get("linked_control_id"))
    linked_vendor_id = coerce_optional_int("linked_vendor_id", filter_values.get("linked_vendor_id"))
    search = coerce_optional_string("search", filter_values.get("search"))
    include_closed_filter = coerce_optional_bool("include_closed", filter_values.get("include_closed"))
    include_closed = True if include_closed_filter is None else include_closed_filter
    offset = collection_query.offset
    limit = collection_query.limit
    sort_by = collection_query.sort.field if collection_query.sort else sort_by
    sort_order = collection_query.sort.direction if collection_query.sort else sort_order
    collection_capabilities = {
        "can_create": has_permission(current_user, "issues", "write"),
        "can_export": has_permission(current_user, "reports", "read"),
        "can_view_vendor_contexts": has_permission(current_user, "vendors", "read"),
    }

    query = select(Issue)
    now = datetime.now(UTC)
    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)

    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    if status is not None:
        query = query.where(Issue.status == status.value)
    if severity_group_filter == "high_critical":
        query = query.where(Issue.severity.in_((IssueSeverity.high.value, IssueSeverity.critical.value)))
    elif severity is not None:
        query = query.where(Issue.severity == severity.value)
    if owner_user_id is not None:
        query = query.where(Issue.owner_user_id == owner_user_id)
    if exclude_active_exceptions_filter:
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
        if not await can_read_risk_id(db, current_user, linked_risk_id):
            query = query.where(false())
        else:
            linked_kri_ids = select(KeyRiskIndicator.id).where(KeyRiskIndicator.risk_id == linked_risk_id)
            linked_control_ids = select(ControlRiskLink.control_id).where(ControlRiskLink.risk_id == linked_risk_id)
            linked_execution_ids = select(ControlExecution.id).where(
                ControlExecution.control_id.in_(linked_control_ids)
            )
            query = query.where(
                Issue.id.in_(
                    select(IssueLink.issue_id).where(
                        or_(
                            IssueLink.risk_id == linked_risk_id,
                            IssueLink.kri_id.in_(linked_kri_ids),
                            IssueLink.control_id.in_(linked_control_ids),
                            IssueLink.execution_id.in_(linked_execution_ids),
                        )
                    )
                )
            )
    if linked_control_id is not None:
        if not await can_read_control_id(db, current_user, linked_control_id):
            query = query.where(false())
        else:
            linked_execution_ids = select(ControlExecution.id).where(ControlExecution.control_id == linked_control_id)
            query = query.where(
                Issue.id.in_(
                    select(IssueLink.issue_id).where(
                        or_(
                            IssueLink.control_id == linked_control_id,
                            IssueLink.execution_id.in_(linked_execution_ids),
                        )
                    )
                )
            )
    if linked_vendor_id is not None:
        if not await can_read_vendor_id(db, current_user, linked_vendor_id):
            query = query.where(false())
        else:
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
    query_options = (
        selectinload(Issue.department),
        selectinload(Issue.owner),
        selectinload(Issue.links).selectinload(IssueLink.risk),
        selectinload(Issue.links)
        .selectinload(IssueLink.control)
        .selectinload(Control.risk_links)
        .selectinload(ControlRiskLink.risk),
        selectinload(Issue.links)
        .selectinload(IssueLink.execution)
        .selectinload(ControlExecution.control)
        .selectinload(Control.risk_links)
        .selectinload(ControlRiskLink.risk),
        selectinload(Issue.links).selectinload(IssueLink.kri).selectinload(KeyRiskIndicator.risk),
        selectinload(Issue.links).selectinload(IssueLink.vendor),
    )

    ordered_query = query.options(*query_options)

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        all_items = []
        for issue in result.scalars().all():
            capabilities = await issue_capabilities(db, current_user=current_user, issue=issue)
            all_items.append(_serialize_issue_summary(issue, current_user=current_user, capabilities=capabilities))
        paginated_items, grouped_total, groups = build_grouped_collection_page(
            all_items,
            collection_query,
            get_entries=_issue_group_entries,
            is_active=lambda issue: issue.status != IssueStatus.closed.value,
            is_highlighted=lambda issue: issue.severity in {IssueSeverity.high.value, IssueSeverity.critical.value},
        )
        return IssueListResponse(
            items=paginated_items,
            total=grouped_total,
            offset=offset,
            limit=limit,
            groups=groups,
            capabilities=collection_capabilities,
        )

    result = await db.execute(ordered_query.offset(offset).limit(limit))
    issues = result.scalars().all()
    items = []
    for issue in issues:
        capabilities = await issue_capabilities(db, current_user=current_user, issue=issue)
        items.append(_serialize_issue_summary(issue, current_user=current_user, capabilities=capabilities))

    return IssueListResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        capabilities=collection_capabilities,
    )
