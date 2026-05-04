from __future__ import annotations

from typing import Any

from sqlalchemy import String, case, false, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import vendor_visibility_clause
from app.models import Department, Risk, User, Vendor, VendorRiskLink
from app.schemas.risk import RiskStatusEnum
from app.services._collection_contracts import CollectionGroupEntry, build_grouped_collection_page

from .lifecycle import RegisterListingPlan, SerializeItems, _plan_register_listing

RISK_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
RISK_GROUP_UNCATEGORIZED = "__uncategorized__"
RISK_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
RISK_GROUP_NO_PROCESS = "__no_process__"
RISK_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
RISK_SQL_GROUPS = {"category", "department", "process", "risk_type", "type", "vendor"}


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
) -> list[dict[str, Any]]:
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

    group_query = (
        select(
            value_expr.label("value"),
            label_expr.label("label"),
            func.count(Risk.id).label("count"),
            func.sum(case((Risk.status == RiskStatusEnum.active.value, 1), else_=0)).label("active_count"),
            func.sum(case((Risk.net_score >= 16, 1), else_=0)).label("highlighted_count"),
        )
        .select_from(Risk)
        .join(filtered_ids, Risk.id == filtered_ids.c.id)
    )
    for join_target in joins:
        if join_target == "vendor":
            group_query = group_query.outerjoin(vendor_context, vendor_context.c.risk_id == Risk.id)
        else:
            group_query = group_query.outerjoin(join_target)
    rows = (await db.execute(group_query.group_by(value_expr, label_expr).order_by(func.lower(label_expr)))).all()
    return [
        {
            "value": row.value,
            "label": row.label,
            "count": row.count or 0,
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


def risk_in_memory_grouped_page(all_items: list[Any], query):
    return build_grouped_collection_page(
        all_items,
        query,
        get_entries=risk_group_entries,
        is_active=lambda risk: risk.status == RiskStatusEnum.active.value,
        is_highlighted=lambda risk: risk.net_score >= 16,
    )


def plan_risk_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_vendors: bool,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Any, Any],
    total: int,
) -> RegisterListingPlan:
    async def load_sql_groups(group_by: str):
        return await load_risk_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_vendors=can_read_vendors,
        )

    def build_sql_group_filter(group_by: str, group_value: str | None):
        vendor_context = (
            visible_risk_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
            if group_by == "vendor"
            else None
        )
        return risk_group_value_filter(group_by, group_value or "", vendor_context=vendor_context)

    return _plan_register_listing(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        total=total,
        sql_group_keys=RISK_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        build_in_memory_grouped_page=risk_in_memory_grouped_page,
    )
