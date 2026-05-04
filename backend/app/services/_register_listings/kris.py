from __future__ import annotations

from typing import Any

from sqlalchemy import String, case, false, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import vendor_visibility_clause
from app.models import Department, KeyRiskIndicator, Risk, User, Vendor, VendorKRILink
from app.schemas.collection import CollectionGroupRead
from app.services._collection_contracts import CollectionGroupEntry, build_grouped_collection_page

from .lifecycle import RegisterListingPlan, SerializeItems, _plan_register_listing

KRI_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
KRI_GROUP_UNCATEGORIZED = "__uncategorized__"
KRI_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
KRI_GROUP_NO_PROCESS = "__no_process__"
KRI_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
KRI_GROUP_UNKNOWN_RISK = "__unknown_risk__"
KRI_SQL_GROUPS = {"category", "department", "process", "risk", "risk_type", "type", "vendor"}


def kri_group_entries(kri, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "vendor":
        vendors = getattr(kri, "linked_vendors", None) or []
        if not vendors:
            return [CollectionGroupEntry(KRI_GROUP_UNLINKED_VENDOR, KRI_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(f"vendor:{vendor.id}", vendor.name) for vendor in vendors]
    if group_by == "category":
        value = kri.risk_category or KRI_GROUP_UNCATEGORIZED
        return [CollectionGroupEntry(value, value)]
    if group_by == "department":
        value = kri.department_name or KRI_GROUP_UNKNOWN_DEPARTMENT
        return [CollectionGroupEntry(value, value)]
    if group_by == "process":
        value = kri.risk_process or KRI_GROUP_NO_PROCESS
        return [CollectionGroupEntry(value, value)]
    if group_by in {"type", "risk_type"}:
        value = kri.risk_type or KRI_GROUP_UNKNOWN_RISK_TYPE
        return [CollectionGroupEntry(value, value)]
    if group_by == "risk":
        value = kri.risk_name or KRI_GROUP_UNKNOWN_RISK
        return [
            CollectionGroupEntry(
                value,
                value,
                {
                    "risk_type": kri.risk_type or "",
                    "risk_department_name": kri.risk_department_name or "",
                    "risk_owner_name": kri.risk_owner_name or "",
                },
            )
        ]
    return []


def count_distinct_kri_if(condition):
    return func.count(func.distinct(case((condition, KeyRiskIndicator.id))))


def visible_kri_vendor_context(filtered_ids, current_user: User, *, can_read_vendors: bool):
    query = (
        select(
            VendorKRILink.kri_id.label("kri_id"),
            Vendor.id.label("vendor_id"),
            Vendor.name.label("vendor_name"),
        )
        .select_from(VendorKRILink)
        .join(filtered_ids, filtered_ids.c.id == VendorKRILink.kri_id)
        .join(Vendor, Vendor.id == VendorKRILink.vendor_id)
    )
    vendor_visibility = vendor_visibility_clause(current_user) if can_read_vendors else false()
    if vendor_visibility is not None:
        query = query.where(vendor_visibility)
    return query.subquery()


async def load_kri_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_vendors: bool,
) -> list[CollectionGroupRead]:
    breach_expr = or_(
        KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
    )
    active_expr = KeyRiskIndicator.is_archived.is_(False)

    if group_by == "category":
        value_expr = func.coalesce(Risk.category, KRI_GROUP_UNCATEGORIZED)
        label_expr = value_expr
        meta_expr = None
    elif group_by == "department":
        value_expr = func.coalesce(Department.name, KRI_GROUP_UNKNOWN_DEPARTMENT)
        label_expr = value_expr
        meta_expr = None
    elif group_by == "process":
        value_expr = func.coalesce(Risk.process, KRI_GROUP_NO_PROCESS)
        label_expr = value_expr
        meta_expr = None
    elif group_by in {"risk_type", "type"}:
        value_expr = func.coalesce(Risk.risk_type, KRI_GROUP_UNKNOWN_RISK_TYPE)
        label_expr = value_expr
        meta_expr = None
    elif group_by == "risk":
        value_expr = func.coalesce(Risk.name, KRI_GROUP_UNKNOWN_RISK)
        label_expr = value_expr
        meta_expr = {
            "risk_type": func.coalesce(Risk.risk_type, ""),
            "risk_department_name": func.coalesce(Department.name, ""),
            "risk_owner_name": literal(""),
        }
    elif group_by == "vendor":
        vendor_context = visible_kri_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
        value_expr = func.coalesce(
            literal("vendor:") + func.cast(vendor_context.c.vendor_id, String),
            KRI_GROUP_UNLINKED_VENDOR,
        )
        label_expr = func.coalesce(vendor_context.c.vendor_name, KRI_GROUP_UNLINKED_VENDOR)
        meta_expr = None
    else:
        return []

    selected_columns = [
        value_expr.label("value"),
        label_expr.label("label"),
        func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        count_distinct_kri_if(active_expr).label("active_count"),
        count_distinct_kri_if(breach_expr).label("highlighted_count"),
    ]
    if isinstance(meta_expr, dict):
        selected_columns.extend(expr.label(key) for key, expr in meta_expr.items())

    query = (
        select(*selected_columns)
        .select_from(KeyRiskIndicator)
        .join(filtered_ids, filtered_ids.c.id == KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
    )
    if group_by in {"department", "risk"}:
        query = query.outerjoin(Department, Department.id == Risk.department_id)
    if group_by == "vendor":
        query = query.outerjoin(vendor_context, vendor_context.c.kri_id == KeyRiskIndicator.id)

    group_columns = [value_expr, label_expr]
    if isinstance(meta_expr, dict):
        group_columns.extend(meta_expr.values())

    groups = []
    for row in (await db.execute(query.group_by(*group_columns).order_by(func.lower(label_expr)))).all():
        meta = {key: getattr(row, key, "") for key in meta_expr} if isinstance(meta_expr, dict) else {}
        groups.append(
            CollectionGroupRead(
                value=str(row.value),
                label=str(row.label),
                count=row.count,
                active_count=row.active_count,
                highlighted_count=row.highlighted_count,
                meta=meta,
            )
        )
    return groups


def kri_group_filter(group_by: str, group_value: str, *, vendor_context=None):
    if group_by == "category":
        return func.coalesce(Risk.category, KRI_GROUP_UNCATEGORIZED) == group_value
    if group_by == "department":
        return func.coalesce(Department.name, KRI_GROUP_UNKNOWN_DEPARTMENT) == group_value
    if group_by == "process":
        return func.coalesce(Risk.process, KRI_GROUP_NO_PROCESS) == group_value
    if group_by in {"risk_type", "type"}:
        return func.coalesce(Risk.risk_type, KRI_GROUP_UNKNOWN_RISK_TYPE) == group_value
    if group_by == "risk":
        return func.coalesce(Risk.name, KRI_GROUP_UNKNOWN_RISK) == group_value
    if group_by == "vendor" and group_value.startswith("vendor:"):
        try:
            vendor_id = int(group_value.removeprefix("vendor:"))
        except ValueError:
            return KeyRiskIndicator.id.is_(None)
        if vendor_context is None:
            return KeyRiskIndicator.id.is_(None)
        return KeyRiskIndicator.id.in_(select(vendor_context.c.kri_id).where(vendor_context.c.vendor_id == vendor_id))
    if group_by == "vendor" and group_value == KRI_GROUP_UNLINKED_VENDOR and vendor_context is not None:
        return ~KeyRiskIndicator.id.in_(select(vendor_context.c.kri_id))
    return None


def kri_in_memory_grouped_page(all_items, query):
    return build_grouped_collection_page(
        all_items,
        query,
        get_entries=kri_group_entries,
        is_highlighted=lambda item: getattr(item, "monitoring_status", None) == "breach",
    )


def plan_kri_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_vendors: bool,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Any, Any],
    load_total,
) -> RegisterListingPlan:
    async def load_sql_groups(group_by: str):
        return await load_kri_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_vendors=can_read_vendors,
        )

    def build_sql_group_filter(group_by: str, group_value: str | None):
        vendor_context = (
            visible_kri_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
            if group_by == "vendor"
            else None
        )
        return kri_group_filter(group_by, group_value or "", vendor_context=vendor_context)

    return _plan_register_listing(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        load_total=load_total,
        sql_group_keys=KRI_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        sql_group_query_transform=lambda query: query.outerjoin(Department, Department.id == Risk.department_id),
        build_in_memory_grouped_page=kri_in_memory_grouped_page,
    )
