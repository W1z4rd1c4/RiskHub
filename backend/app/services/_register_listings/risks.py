from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from sqlalchemy import String, and_, asc, case, desc, false, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.risk import risk_to_summary
from app.core.permissions import can_read_vendor, risk_visibility_clause, vendor_visibility_clause
from app.core.security import check_permission
from app.models import (
    ApprovalResourceType,
    ControlRiskLink,
    Department,
    KeyRiskIndicator,
    Risk,
    User,
    Vendor,
    VendorRiskLink,
)
from app.models._archivable import archived_clause
from app.models.global_config import ConfigDefaults, get_config_int
from app.schemas.risk import RiskStatusEnum
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._authorization_capabilities import risk_capabilities
from app.services._authorization_capabilities.common import pending_approvals_for_resources
from app.services._collection_contracts import CollectionGroupEntry, CollectionQuery, build_grouped_collection_page
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)

from .lifecycle import RegisterListingPlan, SerializeItems, _plan_register_listing

RISK_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
RISK_GROUP_UNCATEGORIZED = "__uncategorized__"
RISK_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
RISK_GROUP_NO_PROCESS = "__no_process__"
RISK_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
RISK_SQL_GROUPS = {"category", "department", "process", "risk_type", "type", "vendor"}


@dataclass(frozen=True)
class RiskListingCriteria:
    query: CollectionQuery
    filters: dict[str, Any]
    sort_by: str | None = None
    sort_order: str | None = None


def risk_group_entries(risk, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "vendor":
        vendors = risk.linked_vendors or []
        if not vendors:
            return [CollectionGroupEntry(RISK_GROUP_UNLINKED_VENDOR, RISK_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(f"vendor:{vendor.id}", vendor.name) for vendor in vendors]
    if group_by == "category":
        value = risk.category or RISK_GROUP_UNCATEGORIZED
        return [CollectionGroupEntry(value, value)]
    if group_by == "department":
        value = risk.department_name or RISK_GROUP_UNKNOWN_DEPARTMENT
        return [CollectionGroupEntry(value, value)]
    if group_by == "process":
        value = risk.process or RISK_GROUP_NO_PROCESS
        return [CollectionGroupEntry(value, value)]
    if group_by in {"risk_type", "type"}:
        value = risk.risk_type or RISK_GROUP_UNKNOWN_RISK_TYPE
        return [CollectionGroupEntry(value, value)]
    return []


def visible_risk_vendor_context(filtered_ids, current_user: User, *, can_read_vendors: bool):
    query = (
        select(
            VendorRiskLink.risk_id.label("risk_id"),
            Vendor.id.label("vendor_id"),
            Vendor.name.label("vendor_name"),
        )
        .select_from(VendorRiskLink)
        .join(filtered_ids, filtered_ids.c.id == VendorRiskLink.risk_id)
        .join(Vendor, Vendor.id == VendorRiskLink.vendor_id)
    )
    vendor_visibility = vendor_visibility_clause(current_user) if can_read_vendors else false()
    if vendor_visibility is not None:
        query = query.where(vendor_visibility)
    return query.subquery()


async def load_risk_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_vendors: bool,
    critical_risk_min_net_score: int,
) -> list[dict[str, Any]]:
    value_expr: Any
    label_expr: Any
    joins: tuple[Any, ...]

    if group_by == "category":
        value_expr = func.coalesce(func.nullif(Risk.category, ""), RISK_GROUP_UNCATEGORIZED)
        label_expr = value_expr
        joins = ()
    elif group_by == "department":
        value_expr = func.coalesce(func.nullif(Department.name, ""), RISK_GROUP_UNKNOWN_DEPARTMENT)
        label_expr = value_expr
        joins = (Risk.department,)
    elif group_by == "process":
        value_expr = func.coalesce(func.nullif(Risk.process, ""), RISK_GROUP_NO_PROCESS)
        label_expr = value_expr
        joins = ()
    elif group_by in {"risk_type", "type"}:
        value_expr = func.coalesce(func.nullif(Risk.risk_type, ""), RISK_GROUP_UNKNOWN_RISK_TYPE)
        label_expr = value_expr
        joins = ()
    elif group_by == "vendor" and can_read_vendors:
        vendor_context = visible_risk_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
        value_expr = func.coalesce(
            literal("vendor:") + func.cast(vendor_context.c.vendor_id, String),
            RISK_GROUP_UNLINKED_VENDOR,
        )
        label_expr = func.coalesce(vendor_context.c.vendor_name, RISK_GROUP_UNLINKED_VENDOR)
        joins = ("vendor",)
    elif group_by == "vendor":
        value_expr = literal(RISK_GROUP_UNLINKED_VENDOR)
        label_expr = value_expr
        joins = ()
    else:
        return []

    active_expr = and_(Risk.status == RiskStatusEnum.active.value, Risk.live())
    group_query = (
        select(
            value_expr.label("value"),
            label_expr.label("label"),
            func.count(Risk.id).label("count"),
            func.sum(case((active_expr, 1), else_=0)).label("active_count"),
            func.sum(case((Risk.net_score >= critical_risk_min_net_score, 1), else_=0)).label("highlighted_count"),
        )
        .select_from(Risk)
        .join(filtered_ids, Risk.id == filtered_ids.c.id)
    )
    for join_target in joins:
        if join_target == "vendor":
            group_query = group_query.outerjoin(vendor_context, vendor_context.c.risk_id == Risk.id)
        else:
            group_query = group_query.outerjoin(cast(Any, join_target))
    rows = (await db.execute(group_query.group_by(value_expr, label_expr).order_by(func.lower(label_expr)))).all()
    return [
        {
            "value": row.value,
            "label": row.label,
            "count": row._mapping["count"] or 0,
            "active_count": row.active_count or 0,
            "highlighted_count": row.highlighted_count or 0,
            "meta": {},
        }
        for row in rows
    ]


def risk_group_value_filter(group_by: str, group_value: str, *, vendor_context=None):
    if group_by == "category":
        if group_value == RISK_GROUP_UNCATEGORIZED:
            return or_(Risk.category.is_(None), Risk.category == "")
        return Risk.category == group_value
    if group_by == "department":
        if group_value == RISK_GROUP_UNKNOWN_DEPARTMENT:
            return Risk.department_id.is_(None)
        return Risk.department.has(Department.name == group_value)
    if group_by == "process":
        if group_value == RISK_GROUP_NO_PROCESS:
            return or_(Risk.process.is_(None), Risk.process == "")
        return Risk.process == group_value
    if group_by in {"risk_type", "type"}:
        if group_value == RISK_GROUP_UNKNOWN_RISK_TYPE:
            return or_(Risk.risk_type.is_(None), Risk.risk_type == "")
        return Risk.risk_type == group_value
    if group_by == "vendor" and group_value.startswith("vendor:"):
        try:
            vendor_id = int(group_value.removeprefix("vendor:"))
        except ValueError:
            return Risk.id.is_(None)
        if vendor_context is None:
            return Risk.id.is_(None)
        return Risk.id.in_(select(vendor_context.c.risk_id).where(vendor_context.c.vendor_id == vendor_id))
    if group_by == "vendor" and group_value == RISK_GROUP_UNLINKED_VENDOR and vendor_context is not None:
        return ~Risk.id.in_(select(vendor_context.c.risk_id))
    return None


def risk_in_memory_grouped_page(all_items: list[Any], query, *, critical_risk_min_net_score: int):
    return build_grouped_collection_page(
        all_items,
        query,
        get_entries=risk_group_entries,
        is_active=lambda risk: risk.status == RiskStatusEnum.active.value and not risk.is_archived,
        is_highlighted=lambda risk: risk.net_score >= critical_risk_min_net_score,
    )


def _plan_risk_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_vendors: bool,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Risk, Any],
    total: int,
    critical_risk_min_net_score: int,
) -> RegisterListingPlan[Risk, Any]:
    vendor_context = None

    def get_vendor_context():
        nonlocal vendor_context
        if vendor_context is None:
            vendor_context = visible_risk_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
        return vendor_context

    async def load_sql_groups(group_by: str):
        return await load_risk_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_vendors=can_read_vendors,
            critical_risk_min_net_score=critical_risk_min_net_score,
        )

    def build_sql_group_filter(group_by: str, group_value: str | None):
        group_vendor_context = get_vendor_context() if group_by == "vendor" else None
        return risk_group_value_filter(group_by, group_value or "", vendor_context=group_vendor_context)

    return _plan_register_listing(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        total=total,
        sql_group_keys=RISK_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        build_in_memory_grouped_page=lambda all_items, query: risk_in_memory_grouped_page(
            all_items,
            query,
            critical_risk_min_net_score=critical_risk_min_net_score,
        ),
    )


async def plan_risk_listing(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: RiskListingCriteria,
) -> RegisterListingPlan[Risk, Any]:
    from app.core.permissions import get_risk_ids_where_control_owner, get_risk_ids_where_kri_reporting_owner

    collection_query = criteria.query
    filter_values = criteria.filters
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    status_value = filter_values.get("status")
    archived_status_filter = str(status_value).lower() == "archived" if status_value is not None else False
    status = None if archived_status_filter else coerce_optional_enum(RiskStatusEnum, status_value, "status")
    risk_type = coerce_optional_string("risk_type", filter_values.get("risk_type"))
    is_priority = coerce_optional_bool("is_priority", filter_values.get("is_priority"))
    search = coerce_optional_string("search", filter_values.get("search"))
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    has_breach = coerce_optional_bool("has_breach", filter_values.get("has_breach"))
    min_net_score = coerce_optional_int("min_net_score", filter_values.get("min_net_score"), min_value=0, max_value=25)
    process = coerce_optional_string("process", filter_values.get("process"))
    category = coerce_optional_string("category", filter_values.get("category"))
    sort_by = collection_query.sort.field if collection_query.sort else criteria.sort_by
    sort_order = collection_query.sort.direction if collection_query.sort else criteria.sort_order

    base_query = select(Risk)

    visibility_clause = await risk_visibility_clause(db, current_user, department_id=department_id)
    if visibility_clause is not None:
        base_query = base_query.where(visibility_clause)

    if archived_status_filter:
        base_query = base_query.where(archived_clause(Risk, archived=True))
    elif status:
        base_query = base_query.where(Risk.status == status.value)
        base_query = base_query.where(archived_clause(Risk, archived=False))
    elif not include_archived:
        base_query = base_query.where(archived_clause(Risk, archived=False))

    if risk_type:
        base_query = base_query.where(Risk.risk_type == risk_type)

    if is_priority is not None:
        base_query = base_query.where(Risk.is_priority == is_priority)

    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Risk.risk_id_code.ilike(search_pattern),
                Risk.name.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.process.ilike(search_pattern),
            )
        )

    if has_breach is not None:
        breaching_subq = (
            select(KeyRiskIndicator.risk_id)
            .where(
                KeyRiskIndicator.is_archived.is_(False),
                or_(
                    KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                    KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
                ),
            )
            .scalar_subquery()
        )

        if has_breach:
            base_query = base_query.where(Risk.id.in_(breaching_subq))
        else:
            base_query = base_query.where(Risk.id.notin_(breaching_subq))

    if min_net_score is not None:
        base_query = base_query.where(Risk.net_score >= min_net_score)

    if process:
        base_query = base_query.where(Risk.process == process)

    if category:
        base_query = base_query.where(Risk.category == category)

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    critical_risk_min_net_score = await get_config_int(
        db,
        "critical_risk_min_net_score",
        ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE,
    )

    order_column: Any = Risk.risk_id_code
    if sort_by:
        if sort_by == "name":
            order_column = Risk.name
        elif sort_by == "description":
            order_column = Risk.description
        elif sort_by == "status":
            order_column = Risk.status
        elif sort_by == "risk_id_code":
            order_column = Risk.risk_id_code
        elif sort_by == "category":
            order_column = Risk.category
        elif sort_by == "type":
            order_column = Risk.risk_type
        elif sort_by == "risk_type":
            order_column = Risk.risk_type
        elif sort_by == "gross_score":
            order_column = Risk.gross_score
        elif sort_by == "net_score":
            order_column = Risk.net_score
        elif sort_by == "kri_count":
            order_column = (
                select(func.count(KeyRiskIndicator.id))
                .where(
                    KeyRiskIndicator.risk_id == Risk.id,
                    KeyRiskIndicator.is_archived.is_(False),
                )
                .scalar_subquery()
            )
        elif sort_by == "control_count":
            order_column = (
                select(func.count(ControlRiskLink.id)).where(ControlRiskLink.risk_id == Risk.id).scalar_subquery()
            )

    if sort_order == "desc":
        base_query = base_query.order_by(desc(order_column))
    else:
        base_query = base_query.order_by(asc(order_column))

    query_options = (
        selectinload(Risk.department),
        selectinload(Risk.owner),
        selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        selectinload(Risk.control_links),
        selectinload(Risk.vendor_links).selectinload(VendorRiskLink.vendor),
    )

    can_read_vendors = check_permission(current_user, "vendors", "read")
    collection_capabilities = {
        "can_create": check_permission(current_user, "risks", "write"),
        "can_export": check_permission(current_user, "reports", "read"),
        "can_view_vendor_contexts": can_read_vendors,
    }

    async def serialize_risks(risks: list[Risk]):
        risk_ids = {risk.id for risk in risks}
        approvals_by_risk = await pending_approvals_for_resources(
            db,
            resource_type=ApprovalResourceType.RISK,
            resource_ids=risk_ids,
        )
        high_risk_min_net_score = await get_config_int(
            db,
            "high_risk_min_net_score",
            ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
        )
        kri_reporting_owner_risk_ids = set(await get_risk_ids_where_kri_reporting_owner(db, current_user.id))
        control_owner_risk_ids = set(await get_risk_ids_where_control_owner(db, current_user.id))
        items = []
        for risk in risks:
            linked_vendors: list[LinkedVendorRead] = []
            if can_read_vendors:
                for link in getattr(risk, "vendor_links", []) or []:
                    vendor = getattr(link, "vendor", None)
                    if vendor is None or not can_read_vendor(vendor, current_user):
                        continue
                    linked_vendors.append(
                        LinkedVendorRead(
                            id=vendor.id,
                            name=vendor.name,
                            is_archived=vendor.is_archived,
                        )
                    )
            capabilities = await risk_capabilities(
                db,
                current_user=current_user,
                risk=risk,
                preloaded_approvals=approvals_by_risk.get(risk.id, []),
                high_risk_min_net_score=high_risk_min_net_score,
                can_read_override=True,
                is_kri_reporting_owner_for_risk=risk.id in kri_reporting_owner_risk_ids,
                is_control_owner_for_risk=risk.id in control_owner_risk_ids,
            )
            items.append(risk_to_summary(risk, linked_vendors=linked_vendors, capabilities=capabilities))
        return items

    ordered_query = base_query.options(*query_options)
    filtered_ids = base_query.with_only_columns(Risk.id).order_by(None).subquery()

    return _plan_risk_listing(
        db=db,
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_risks,
        total=total,
        critical_risk_min_net_score=critical_risk_min_net_score,
    )
