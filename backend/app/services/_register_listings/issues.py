from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.exceptions import ValidationError
from app.core.permissions import (
    can_read_control_id,
    can_read_risk_id,
    can_read_vendor_id,
    get_issue_scope_clause,
    has_permission,
)
from app.models import (
    Control,
    ControlExecution,
    ControlRiskLink,
    Department,
    Issue,
    IssueLink,
    KeyRiskIndicator,
    User,
)
from app.models.issue import IssueSeverity, IssueStatus
from app.schemas.issue import IssueSummary
from app.services._collection_contracts import CollectionQuery, build_grouped_collection_page
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_literal,
    coerce_optional_string,
)
from app.services._issue_register import (
    ISSUE_SQL_GROUPS,
    issue_group_entries,
    issue_group_filter,
    issue_risk_context_subquery,
    issue_vendor_context_subquery,
    load_issue_sql_groups,
    serialize_issue_summaries_for_actor,
)
from app.services.authorization_capabilities import preload_issue_capabilities
from app.services.issue_visibility_service import unsuppressed_issue_clause

from .lifecycle import RegisterListingPlan, SerializeItems, build_register_listing_plan


@dataclass(frozen=True)
class IssueListingCriteria:
    query: CollectionQuery
    filters: dict[str, Any]
    sort_by: str | None
    sort_order: str | None
    capability_loader: Any | None = None
    capability_preloader: Any = preload_issue_capabilities


async def plan_issue_listing(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: IssueListingCriteria,
) -> RegisterListingPlan[Issue, IssueSummary]:
    collection_query = criteria.query
    filter_values = criteria.filters
    status = coerce_optional_enum(IssueStatus, filter_values.get("status"), "status")
    severity = coerce_optional_enum(IssueSeverity, filter_values.get("severity"), "severity")
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
    sort_by = collection_query.sort.field if collection_query.sort else criteria.sort_by
    sort_order = collection_query.sort.direction if collection_query.sort else criteria.sort_order

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
        raise ValidationError("Invalid sort_by value")
    if sort_order is not None and sort_order not in {"asc", "desc"}:
        raise ValidationError("Invalid sort_order value")

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
        selectinload(Issue.links).selectinload(IssueLink.control).selectinload(Control.risk_links).selectinload(
            ControlRiskLink.risk
        ),
        selectinload(Issue.links)
        .selectinload(IssueLink.execution)
        .selectinload(ControlExecution.control)
        .selectinload(Control.risk_links)
        .selectinload(ControlRiskLink.risk),
        selectinload(Issue.links).selectinload(IssueLink.kri).selectinload(KeyRiskIndicator.risk),
        selectinload(Issue.links).selectinload(IssueLink.vendor),
    )
    ordered_query = query.options(*query_options)
    filtered_ids = query.with_only_columns(Issue.id).order_by(None).subquery()

    async def load_sql_groups(group_by: str):
        return await load_issue_sql_groups(db, filtered_ids, group_by, current_user)

    async def build_sql_group_filter(group_by: str, group_value: str | None):
        risk_context = (
            await issue_risk_context_subquery(db, current_user, filtered_ids, group_by)
            if group_by in {"category", "process", "risk_type", "type"}
            else None
        )
        vendor_context = issue_vendor_context_subquery(current_user, filtered_ids) if group_by == "vendor" else None
        return issue_group_filter(
            group_by,
            group_value or "",
            risk_context=risk_context,
            vendor_context=vendor_context,
        )

    async def _serialize_issues(issues: list[Issue]) -> list[IssueSummary]:
        return await serialize_issue_summaries_for_actor(
            db,
            current_user=current_user,
            issues=issues,
            capability_loader=criteria.capability_loader,
            capability_preloader=criteria.capability_preloader,
        )
    serialize_issues: SerializeItems[Issue, IssueSummary] = _serialize_issues

    def build_in_memory_grouped_page(all_items, query):
        return build_grouped_collection_page(
            all_items,
            query,
            get_entries=issue_group_entries,
            is_active=lambda issue: issue.status != IssueStatus.closed.value,
            is_highlighted=lambda issue: issue.severity in {IssueSeverity.high.value, IssueSeverity.critical.value},
        )

    return build_register_listing_plan(
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_issues,
        total=total,
        sql_group_keys=ISSUE_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        sql_group_query_transform=lambda query: query.outerjoin(Department, Department.id == Issue.department_id),
        build_in_memory_grouped_page=build_in_memory_grouped_page,
    )
