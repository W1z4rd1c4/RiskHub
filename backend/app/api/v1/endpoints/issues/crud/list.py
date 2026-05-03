from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, false, func, or_, select, union_all
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
    is_group_summary_request,
    merge_collection_filters,
    parse_collection_query,
)
from app.core.datetime_utils import utc_now
from app.core.permissions import (
    can_read_control_id,
    can_read_risk_id,
    can_read_vendor_id,
    get_issue_scope_clause,
    has_permission,
    risk_visibility_clause,
    vendor_visibility_clause,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import (
    Control,
    ControlExecution,
    ControlRiskLink,
    Department,
    Issue,
    IssueLink,
    KeyRiskIndicator,
    Risk,
    User,
    Vendor,
)
from app.models.issue import IssueSeverity, IssueStatus
from app.schemas.collection import CollectionGroupRead
from app.schemas.issue import IssueListResponse
from app.services.authorization_capabilities import issue_capabilities
from app.services.issue_visibility_service import unsuppressed_issue_clause

from .._shared import _serialize_issue_summary, build_issue_linked_visibility

router = APIRouter()

ISSUE_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
ISSUE_GROUP_UNCATEGORIZED = "__uncategorized__"
ISSUE_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
ISSUE_GROUP_NO_PROCESS = "__no_process__"
ISSUE_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
ISSUE_SQL_GROUPS = {"category", "department", "process", "risk_type", "type", "vendor"}


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


def _count_distinct_issue_if(condition):
    return func.count(func.distinct(case((condition, Issue.id))))


async def _issue_risk_context_subquery(db: AsyncSession, current_user: User, filtered_ids, group_by: str):
    if group_by == "category":
        value_expr = func.coalesce(func.nullif(Risk.category, ""), ISSUE_GROUP_UNCATEGORIZED)
    elif group_by == "process":
        value_expr = func.coalesce(func.nullif(Risk.process, ""), ISSUE_GROUP_NO_PROCESS)
    elif group_by in {"risk_type", "type"}:
        value_expr = func.coalesce(func.nullif(Risk.risk_type, ""), ISSUE_GROUP_UNKNOWN_RISK_TYPE)
    else:
        return None

    risk_visibility = await risk_visibility_clause(db, current_user)

    direct_risks = (
        select(IssueLink.issue_id.label("issue_id"), value_expr.label("value"))
        .join(filtered_ids, filtered_ids.c.id == IssueLink.issue_id)
        .join(Risk, Risk.id == IssueLink.risk_id)
        .where(IssueLink.risk_id.is_not(None))
    )
    kri_risks = (
        select(IssueLink.issue_id.label("issue_id"), value_expr.label("value"))
        .join(filtered_ids, filtered_ids.c.id == IssueLink.issue_id)
        .join(KeyRiskIndicator, KeyRiskIndicator.id == IssueLink.kri_id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(IssueLink.kri_id.is_not(None))
    )
    control_risks = (
        select(IssueLink.issue_id.label("issue_id"), value_expr.label("value"))
        .join(filtered_ids, filtered_ids.c.id == IssueLink.issue_id)
        .join(ControlRiskLink, ControlRiskLink.control_id == IssueLink.control_id)
        .join(Risk, Risk.id == ControlRiskLink.risk_id)
        .where(IssueLink.control_id.is_not(None))
    )
    execution_risks = (
        select(IssueLink.issue_id.label("issue_id"), value_expr.label("value"))
        .join(filtered_ids, filtered_ids.c.id == IssueLink.issue_id)
        .join(ControlExecution, ControlExecution.id == IssueLink.execution_id)
        .join(ControlRiskLink, ControlRiskLink.control_id == ControlExecution.control_id)
        .join(Risk, Risk.id == ControlRiskLink.risk_id)
        .where(IssueLink.execution_id.is_not(None))
    )
    if risk_visibility is not None:
        direct_risks = direct_risks.where(risk_visibility)
        kri_risks = kri_risks.where(risk_visibility)
        control_risks = control_risks.where(risk_visibility)
        execution_risks = execution_risks.where(risk_visibility)
    return union_all(direct_risks, kri_risks, control_risks, execution_risks).subquery()


def _issue_vendor_context_subquery(current_user: User, filtered_ids):
    query = (
        select(
            IssueLink.issue_id.label("issue_id"),
            Vendor.id.label("vendor_id"),
            Vendor.name.label("vendor_name"),
        )
        .select_from(IssueLink)
        .join(filtered_ids, filtered_ids.c.id == IssueLink.issue_id)
        .join(Vendor, Vendor.id == IssueLink.vendor_id)
        .where(IssueLink.vendor_id.is_not(None))
    )
    vendor_visibility = vendor_visibility_clause(current_user)
    if vendor_visibility is not None:
        query = query.where(vendor_visibility)
    return query.subquery()


async def _load_issue_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    current_user: User,
) -> list[CollectionGroupRead]:
    active_expr = Issue.status != IssueStatus.closed.value
    highlighted_expr = Issue.severity.in_((IssueSeverity.high.value, IssueSeverity.critical.value))

    if group_by == "department":
        value_expr = func.coalesce(Department.name, ISSUE_GROUP_UNKNOWN_DEPARTMENT)
        label_expr = value_expr
        query = (
            select(
                value_expr.label("value"),
                label_expr.label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
                _count_distinct_issue_if(active_expr).label("active_count"),
                _count_distinct_issue_if(highlighted_expr).label("highlighted_count"),
            )
            .select_from(Issue)
            .join(filtered_ids, filtered_ids.c.id == Issue.id)
            .outerjoin(Department, Department.id == Issue.department_id)
            .group_by(value_expr, label_expr)
            .order_by(func.lower(label_expr))
        )
    elif group_by == "vendor":
        vendor_context = _issue_vendor_context_subquery(current_user, filtered_ids)
        value_expr = func.coalesce(vendor_context.c.vendor_name, ISSUE_GROUP_UNLINKED_VENDOR)
        label_expr = value_expr
        query = (
            select(
                value_expr.label("value"),
                label_expr.label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
                _count_distinct_issue_if(active_expr).label("active_count"),
                _count_distinct_issue_if(highlighted_expr).label("highlighted_count"),
            )
            .select_from(Issue)
            .join(filtered_ids, filtered_ids.c.id == Issue.id)
            .outerjoin(vendor_context, vendor_context.c.issue_id == Issue.id)
            .group_by(value_expr, label_expr)
            .order_by(func.lower(label_expr))
        )
    else:
        context = await _issue_risk_context_subquery(db, current_user, filtered_ids, group_by)
        if context is None:
            return []
        fallback_value = _issue_group_fallback_value(group_by)
        value_expr = func.coalesce(context.c.value, fallback_value)
        label_expr = value_expr
        query = (
            select(
                value_expr.label("value"),
                label_expr.label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
                _count_distinct_issue_if(active_expr).label("active_count"),
                _count_distinct_issue_if(highlighted_expr).label("highlighted_count"),
            )
            .select_from(Issue)
            .join(filtered_ids, filtered_ids.c.id == Issue.id)
            .outerjoin(context, context.c.issue_id == Issue.id)
            .group_by(value_expr, label_expr)
            .order_by(func.lower(label_expr))
        )

    return [
        CollectionGroupRead(
            value=str(row.value),
            label=str(row.label),
            count=row.count,
            active_count=row.active_count,
            highlighted_count=row.highlighted_count,
            meta={},
        )
        for row in (await db.execute(query)).all()
    ]


def _issue_group_fallback_value(group_by: str) -> str:
    if group_by == "category":
        return ISSUE_GROUP_UNCATEGORIZED
    if group_by == "process":
        return ISSUE_GROUP_NO_PROCESS
    if group_by in {"risk_type", "type"}:
        return ISSUE_GROUP_UNKNOWN_RISK_TYPE
    return ""


def _issue_group_filter(group_by: str, group_value: str, *, risk_context=None, vendor_context=None):
    if group_by == "department":
        return func.coalesce(Department.name, ISSUE_GROUP_UNKNOWN_DEPARTMENT) == group_value
    if group_by == "vendor" and vendor_context is not None:
        if group_value == ISSUE_GROUP_UNLINKED_VENDOR:
            return ~Issue.id.in_(select(vendor_context.c.issue_id))
        return Issue.id.in_(
            select(vendor_context.c.issue_id).where(vendor_context.c.vendor_name == group_value)
        )
    if risk_context is not None:
        fallback_value = _issue_group_fallback_value(group_by)
        matching = select(risk_context.c.issue_id).where(risk_context.c.value == group_value)
        if group_value == fallback_value:
            return or_(Issue.id.in_(matching), ~Issue.id.in_(select(risk_context.c.issue_id)))
        return Issue.id.in_(matching)
    return None


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
    now = utc_now()
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

    if collection_query.group_by and collection_query.group_by in ISSUE_SQL_GROUPS:
        filtered_ids = query.with_only_columns(Issue.id).order_by(None).subquery()
        risk_context = (
            await _issue_risk_context_subquery(db, current_user, filtered_ids, collection_query.group_by)
            if collection_query.group_by in {"category", "process", "risk_type", "type"}
            else None
        )
        vendor_context = (
            _issue_vendor_context_subquery(current_user, filtered_ids)
            if collection_query.group_by == "vendor"
            else None
        )
        groups = await _load_issue_sql_groups(db, filtered_ids, collection_query.group_by, current_user)
        if is_group_summary_request(collection_query):
            return IssueListResponse(
                items=[],
                total=total,
                offset=offset,
                limit=limit,
                groups=groups,
                capabilities=collection_capabilities,
            )

        group_filter = _issue_group_filter(
            collection_query.group_by,
            collection_query.group_value or "",
            risk_context=risk_context,
            vendor_context=vendor_context,
        )
        grouped_query = ordered_query.outerjoin(Department, Department.id == Issue.department_id)
        if group_filter is not None:
            grouped_query = grouped_query.where(group_filter)
        grouped_total = (
            await db.execute(select(func.count()).select_from(grouped_query.order_by(None).subquery()))
        ).scalar() or 0
        result = await db.execute(grouped_query.offset(offset).limit(limit))
        issues = list(result.scalars().all())
        linked_visibility = await build_issue_linked_visibility(db, current_user, issues)
        items = []
        for issue in issues:
            capabilities = await issue_capabilities(db, current_user=current_user, issue=issue)
            items.append(
                _serialize_issue_summary(
                    issue,
                    current_user=current_user,
                    capabilities=capabilities,
                    linked_visibility=linked_visibility,
                )
            )
        return IssueListResponse(
            items=items,
            total=grouped_total,
            offset=offset,
            limit=limit,
            groups=groups,
            capabilities=collection_capabilities,
        )

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        issues = list(result.scalars().all())
        linked_visibility = await build_issue_linked_visibility(db, current_user, issues)
        all_items = []
        for issue in issues:
            capabilities = await issue_capabilities(db, current_user=current_user, issue=issue)
            all_items.append(
                _serialize_issue_summary(
                    issue,
                    current_user=current_user,
                    capabilities=capabilities,
                    linked_visibility=linked_visibility,
                )
            )
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
    linked_visibility = await build_issue_linked_visibility(db, current_user, issues)
    items = []
    for issue in issues:
        capabilities = await issue_capabilities(db, current_user=current_user, issue=issue)
        items.append(
            _serialize_issue_summary(
                issue,
                current_user=current_user,
                capabilities=capabilities,
                linked_visibility=linked_visibility,
            )
        )

    return IssueListResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        capabilities=collection_capabilities,
    )
