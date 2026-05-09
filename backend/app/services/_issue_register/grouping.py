from sqlalchemy import case, func, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import risk_visibility_clause, vendor_visibility_clause
from app.models import (
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
from app.services._collection_contracts import CollectionGroupEntry

ISSUE_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
ISSUE_GROUP_UNCATEGORIZED = "__uncategorized__"
ISSUE_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
ISSUE_GROUP_NO_PROCESS = "__no_process__"
ISSUE_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
ISSUE_SQL_GROUPS = {"category", "department", "process", "risk_type", "type", "vendor"}


def issue_context_values(issue, *, group_by: str) -> set[str]:
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


def issue_group_entries(issue, group_by: str) -> list[CollectionGroupEntry]:
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

    values = issue_context_values(issue, group_by=group_by)
    if values:
        return [CollectionGroupEntry(value, value) for value in sorted(values)]

    if group_by == "category":
        return [CollectionGroupEntry(ISSUE_GROUP_UNCATEGORIZED, ISSUE_GROUP_UNCATEGORIZED)]
    if group_by == "process":
        return [CollectionGroupEntry(ISSUE_GROUP_NO_PROCESS, ISSUE_GROUP_NO_PROCESS)]
    if group_by in {"risk_type", "type"}:
        return [CollectionGroupEntry(ISSUE_GROUP_UNKNOWN_RISK_TYPE, ISSUE_GROUP_UNKNOWN_RISK_TYPE)]
    return []


def count_distinct_issue_if(condition):
    return func.count(func.distinct(case((condition, Issue.id))))


async def issue_risk_context_subquery(
    db: AsyncSession,
    current_user: User,
    filtered_ids,
    group_by: str,
):
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


def issue_vendor_context_subquery(current_user: User, filtered_ids):
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


async def load_issue_sql_groups(
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
                count_distinct_issue_if(active_expr).label("active_count"),
                count_distinct_issue_if(highlighted_expr).label("highlighted_count"),
            )
            .select_from(Issue)
            .join(filtered_ids, filtered_ids.c.id == Issue.id)
            .outerjoin(Department, Department.id == Issue.department_id)
            .group_by(value_expr, label_expr)
            .order_by(func.lower(label_expr))
        )
    elif group_by == "vendor":
        vendor_context = issue_vendor_context_subquery(current_user, filtered_ids)
        value_expr = func.coalesce(vendor_context.c.vendor_name, ISSUE_GROUP_UNLINKED_VENDOR)
        label_expr = value_expr
        query = (
            select(
                value_expr.label("value"),
                label_expr.label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
                count_distinct_issue_if(active_expr).label("active_count"),
                count_distinct_issue_if(highlighted_expr).label("highlighted_count"),
            )
            .select_from(Issue)
            .join(filtered_ids, filtered_ids.c.id == Issue.id)
            .outerjoin(vendor_context, vendor_context.c.issue_id == Issue.id)
            .group_by(value_expr, label_expr)
            .order_by(func.lower(label_expr))
        )
    else:
        context = await issue_risk_context_subquery(db, current_user, filtered_ids, group_by)
        if context is None:
            return []
        fallback_value = issue_group_fallback_value(group_by)
        value_expr = func.coalesce(context.c.value, fallback_value)
        label_expr = value_expr
        query = (
            select(
                value_expr.label("value"),
                label_expr.label("label"),
                func.count(func.distinct(Issue.id)).label("count"),
                count_distinct_issue_if(active_expr).label("active_count"),
                count_distinct_issue_if(highlighted_expr).label("highlighted_count"),
            )
            .select_from(Issue)
            .join(filtered_ids, filtered_ids.c.id == Issue.id)
            .outerjoin(context, context.c.issue_id == Issue.id)
            .group_by(value_expr, label_expr)
            .order_by(func.lower(label_expr))
        )

    rows = (await db.execute(query)).mappings().all()
    return [
        CollectionGroupRead(
            value=str(row["value"]),
            label=str(row["label"]),
            count=row["count"],
            active_count=row["active_count"],
            highlighted_count=row["highlighted_count"],
            meta={},
        )
        for row in rows
    ]


def issue_group_fallback_value(group_by: str) -> str:
    if group_by == "category":
        return ISSUE_GROUP_UNCATEGORIZED
    if group_by == "process":
        return ISSUE_GROUP_NO_PROCESS
    if group_by in {"risk_type", "type"}:
        return ISSUE_GROUP_UNKNOWN_RISK_TYPE
    return ""


def issue_group_filter(group_by: str, group_value: str, *, risk_context=None, vendor_context=None):
    if group_by == "department":
        return func.coalesce(Department.name, ISSUE_GROUP_UNKNOWN_DEPARTMENT) == group_value
    if group_by == "vendor" and vendor_context is not None:
        if group_value == ISSUE_GROUP_UNLINKED_VENDOR:
            return ~Issue.id.in_(select(vendor_context.c.issue_id))
        return Issue.id.in_(
            select(vendor_context.c.issue_id).where(vendor_context.c.vendor_name == group_value)
        )
    if risk_context is not None:
        fallback_value = issue_group_fallback_value(group_by)
        matching = select(risk_context.c.issue_id).where(risk_context.c.value == group_value)
        if group_value == fallback_value:
            return or_(Issue.id.in_(matching), ~Issue.id.in_(select(risk_context.c.issue_id)))
        return Issue.id.in_(matching)
    return None
