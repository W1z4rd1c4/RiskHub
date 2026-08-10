from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, and_, case, exists, false, func, literal, or_, select, union_all
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
    IssueException,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    User,
)
from app.models.issue import (
    IssueExceptionStatus,
    IssueRemediationStatus,
    IssueSeverity,
    IssueStatus,
)
from app.schemas.collection import CollectionFacetOption
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
from .shared import build_facet_options


@dataclass(frozen=True)
class IssueListingCriteria:
    query: CollectionQuery
    filters: dict[str, Any]
    sort_by: str | None
    sort_order: str | None
    capability_loader: Any | None = None
    capability_preloader: Any = preload_issue_capabilities


def _selected_issue_facet_value(value: Any) -> set[str]:
    if value is None or value == "":
        return set()
    if isinstance(value, bool):
        return {"yes" if value else "no"}
    return {str(getattr(value, "value", value))}


def active_issue_exception_clause(now):
    return exists(
        select(IssueException.id).where(
            IssueException.issue_id == Issue.id,
            IssueException.status == IssueExceptionStatus.approved.value,
            IssueException.expires_at.is_not(None),
            IssueException.expires_at > now,
        )
    )


async def _build_issue_facets(
    db: AsyncSession,
    *,
    status_scope_ids,
    scoped_ids,
    filters: dict[str, Any],
    now,
) -> dict[str, list[CollectionFacetOption]]:
    """Aggregate Issue facets inside the actor's readable collection scope."""

    keys = (
        "status",
        "severity",
        "department",
        "owner",
        "overdue",
        "exception",
        "remediation_status",
    )
    counts: dict[str, Counter[str]] = {key: Counter() for key in keys}
    catalogs: dict[str, dict[str, tuple[str, dict[str, Any]]]] = {key: {} for key in keys}

    direct_queries = [
        select(
            literal("status").label("facet_key"),
            func.cast(Issue.status, String).label("value"),
            func.cast(Issue.status, String).label("label"),
            func.count(func.distinct(Issue.id)).label("count"),
        )
        .select_from(Issue)
        .join(status_scope_ids, status_scope_ids.c.id == Issue.id)
        .group_by(Issue.status),
        select(
            literal("severity").label("facet_key"),
            func.cast(Issue.severity, String).label("value"),
            func.cast(Issue.severity, String).label("label"),
            func.count(func.distinct(Issue.id)).label("count"),
        )
        .select_from(Issue)
        .join(scoped_ids, scoped_ids.c.id == Issue.id)
        .group_by(Issue.severity),
    ]
    direct_queries.extend(
        [
            select(
                literal("department").label("facet_key"),
                func.cast(Issue.department_id, String).label("value"),
                func.coalesce(Department.name, "Unknown department").label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
            )
            .select_from(Issue)
            .join(scoped_ids, scoped_ids.c.id == Issue.id)
            .outerjoin(Department, Department.id == Issue.department_id)
            .group_by(Issue.department_id, Department.name),
            select(
                literal("owner").label("facet_key"),
                func.cast(Issue.owner_user_id, String).label("value"),
                func.coalesce(User.name, "Unassigned").label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
            )
            .select_from(Issue)
            .join(scoped_ids, scoped_ids.c.id == Issue.id)
            .outerjoin(User, User.id == Issue.owner_user_id)
            .where(Issue.owner_user_id.is_not(None))
            .group_by(Issue.owner_user_id, User.name),
        ]
    )

    overdue_expr = case(
        (
            and_(
                Issue.due_at.is_not(None),
                Issue.due_at < now,
                Issue.status != IssueStatus.closed.value,
            ),
            "yes",
        ),
        else_="no",
    )
    exception_expr = case((active_issue_exception_clause(now), "active"), else_="none")
    for key, value_expr in (("overdue", overdue_expr), ("exception", exception_expr)):
        direct_queries.append(
            select(
                literal(key).label("facet_key"),
                value_expr.label("value"),
                value_expr.label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
            )
            .select_from(Issue)
            .join(scoped_ids, scoped_ids.c.id == Issue.id)
            .group_by(value_expr)
        )

    direct_queries.append(
        select(
            literal("remediation_status").label("facet_key"),
            func.cast(IssueRemediationPlan.status, String).label("value"),
            func.cast(IssueRemediationPlan.status, String).label("label"),
            func.count(func.distinct(Issue.id)).label("count"),
        )
        .select_from(Issue)
        .join(scoped_ids, scoped_ids.c.id == Issue.id)
        .join(IssueRemediationPlan, IssueRemediationPlan.issue_id == Issue.id)
        .group_by(IssueRemediationPlan.status)
    )

    for row in (await db.execute(union_all(*direct_queries))).all():
        if row.value is None:
            continue
        value = str(row.value)
        counts[row.facet_key][value] = int(row._mapping["count"] or 0)
        catalogs[row.facet_key][value] = (str(row.label), {})

    catalogs["status"].update({status.value: (status.value, {}) for status in IssueStatus})
    catalogs["severity"].update({severity.value: (severity.value, {}) for severity in IssueSeverity})
    catalogs["severity"]["high_critical"] = ("high_critical", {})
    counts["severity"]["high_critical"] = (
        counts["severity"][IssueSeverity.high.value]
        + counts["severity"][IssueSeverity.critical.value]
    )
    catalogs["overdue"].update({value: (value, {}) for value in ("yes", "no")})
    catalogs["exception"].update({value: (value, {}) for value in ("active", "none")})
    catalogs["remediation_status"].update(
        {status.value: (status.value, {}) for status in IssueRemediationStatus}
    )

    exception_selected: set[str] = set()
    has_active_exception = filters.get("has_active_exception")
    if has_active_exception is not None:
        exception_selected = {"active" if bool(has_active_exception) else "none"}
    elif bool(filters.get("exclude_active_exceptions")):
        exception_selected = {"none"}

    selected = {
        "status": _selected_issue_facet_value(filters.get("status")),
        "severity": (
            {"high_critical"}
            if filters.get("severity_group") == "high_critical"
            else _selected_issue_facet_value(filters.get("severity"))
        ),
        "department": _selected_issue_facet_value(filters.get("department_id")),
        "owner": _selected_issue_facet_value(filters.get("owner_user_id")),
        "overdue": _selected_issue_facet_value(filters.get("overdue")),
        "exception": exception_selected,
        "remediation_status": _selected_issue_facet_value(filters.get("remediation_status")),
    }
    return {
        key: build_facet_options(catalogs[key], counts[key], selected=selected[key])
        for key in keys
    }


async def plan_issue_listing(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: IssueListingCriteria,
) -> RegisterListingPlan[Issue, IssueSummary]:
    collection_query = criteria.query
    filter_values = criteria.filters
    if collection_query.group_by is not None and collection_query.group_by not in ISSUE_SQL_GROUPS:
        raise ValidationError("Invalid Issue group_by value")
    if collection_query.group_value is not None and collection_query.group_by is None:
        raise ValidationError("Issue group_value requires group_by")
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
    has_active_exception = coerce_optional_bool(
        "has_active_exception",
        filter_values.get("has_active_exception"),
    )
    remediation_status = coerce_optional_enum(
        IssueRemediationStatus,
        filter_values.get("remediation_status"),
        "remediation_status",
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

    readable_query = query

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
    if has_active_exception is True:
        query = query.where(active_issue_exception_clause(now))
    elif has_active_exception is False:
        query = query.where(unsuppressed_issue_clause(now))
    if remediation_status is not None:
        query = query.where(
            Issue.id.in_(
                select(IssueRemediationPlan.issue_id).where(
                    IssueRemediationPlan.status == remediation_status.value
                )
            )
        )
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

    facet_scope_query = readable_query
    if department_id is not None:
        facet_scope_query = facet_scope_query.where(Issue.department_id == department_id)
    status_scope_ids = facet_scope_query.with_only_columns(Issue.id).order_by(None).subquery()
    if not include_closed:
        facet_scope_query = facet_scope_query.where(Issue.status != IssueStatus.closed.value)
    facets = await _build_issue_facets(
        db,
        status_scope_ids=status_scope_ids,
        scoped_ids=facet_scope_query.with_only_columns(Issue.id).order_by(None).subquery(),
        filters={
            **filter_values,
            "has_active_exception": has_active_exception,
            "exclude_active_exceptions": exclude_active_exceptions_filter,
        },
        now=now,
    )

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
        selectinload(Issue.remediation_plan).selectinload(IssueRemediationPlan.owner),
        selectinload(Issue.exceptions),
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

    def sql_group_query_transform(query):
        if collection_query.group_by == "department":
            return query.outerjoin(Department, Department.id == Issue.department_id)
        if collection_query.group_by == "owner":
            return query.outerjoin(User, User.id == Issue.owner_user_id)
        return query

    return build_register_listing_plan(
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_issues,
        total=total,
        sql_group_keys=ISSUE_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        sql_group_query_transform=sql_group_query_transform,
        build_in_memory_grouped_page=build_in_memory_grouped_page,
        facets=facets,
    )
