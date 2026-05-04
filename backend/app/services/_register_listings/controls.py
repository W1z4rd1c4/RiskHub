from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy import String, case, false, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import risk_visibility_clause, vendor_visibility_clause
from app.models import Control, ControlRiskLink, Risk, User, Vendor, VendorControlLink
from app.models.department import Department
from app.schemas.collection import CollectionGroupRead
from app.schemas.control import ControlStatusEnum, ControlSummary
from app.services._collection_contracts import CollectionGroupEntry, build_grouped_collection_page

from .lifecycle import RegisterListingPlan, SerializeItems, _plan_register_listing

CONTROL_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
CONTROL_GROUP_UNCATEGORIZED = "__uncategorized__"
CONTROL_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
CONTROL_GROUP_NO_PROCESS = "__no_process__"
CONTROL_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
CONTROL_GROUP_UNKNOWN_RISK = "__unknown_risk__"
CONTROL_SQL_GROUPS = {"category", "department", "process", "risk", "risk_type", "type", "vendor"}


def group_value(value) -> str:
    return str(getattr(value, "value", value))


def control_group_entries(control: ControlSummary, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "vendor":
        vendors = control.linked_vendors or []
        if not vendors:
            return [CollectionGroupEntry(CONTROL_GROUP_UNLINKED_VENDOR, CONTROL_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(f"vendor:{vendor.id}", vendor.name) for vendor in vendors]
    if group_by == "category":
        value = control.control_form or CONTROL_GROUP_UNCATEGORIZED
        return [CollectionGroupEntry(group_value(value), group_value(value))]
    if group_by == "department":
        value = control.department_name or CONTROL_GROUP_UNKNOWN_DEPARTMENT
        return [CollectionGroupEntry(value, value)]
    if group_by == "process":
        return [CollectionGroupEntry(CONTROL_GROUP_NO_PROCESS, CONTROL_GROUP_NO_PROCESS)]
    if group_by in {"risk_type", "type"}:
        value = control.risk_type or CONTROL_GROUP_UNKNOWN_RISK_TYPE
        return [CollectionGroupEntry(value, value)]
    if group_by == "risk":
        value = control.risk_name or CONTROL_GROUP_UNKNOWN_RISK
        return [
            CollectionGroupEntry(
                value,
                value,
                {
                    "risk_type": control.risk_type or "",
                    "risk_department_name": control.risk_department_name or "",
                    "risk_owner_name": control.risk_owner_name or "",
                },
            )
        ]
    return []


def count_distinct_control_if(condition):
    return func.count(func.distinct(case((condition, Control.id))))


async def visible_control_risk_context(db: AsyncSession, filtered_ids, current_user: User):
    risk_visibility = await risk_visibility_clause(db, current_user)
    query = (
        select(
            ControlRiskLink.control_id.label("control_id"),
            Risk.id.label("risk_id"),
            Risk.name.label("risk_name"),
            Risk.process.label("risk_process"),
            Risk.risk_type.label("risk_type"),
            Department.name.label("risk_department_name"),
            literal("").label("risk_owner_name"),
        )
        .select_from(ControlRiskLink)
        .join(filtered_ids, filtered_ids.c.id == ControlRiskLink.control_id)
        .join(Risk, Risk.id == ControlRiskLink.risk_id)
        .outerjoin(Department, Department.id == Risk.department_id)
    )
    if risk_visibility is not None:
        query = query.where(risk_visibility)
    return query.subquery()


def visible_control_vendor_context(filtered_ids, current_user: User, *, can_read_vendors: bool):
    query = (
        select(
            VendorControlLink.control_id.label("control_id"),
            Vendor.id.label("vendor_id"),
            Vendor.name.label("vendor_name"),
        )
        .select_from(VendorControlLink)
        .join(filtered_ids, filtered_ids.c.id == VendorControlLink.control_id)
        .join(Vendor, Vendor.id == VendorControlLink.vendor_id)
    )
    vendor_visibility = vendor_visibility_clause(current_user) if can_read_vendors else false()
    if vendor_visibility is not None:
        query = query.where(vendor_visibility)
    return query.subquery()


async def load_control_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_vendors: bool,
) -> list[CollectionGroupRead]:
    active_expr = Control.status == ControlStatusEnum.active.value
    highlighted_expr = Control.risk_level >= 4
    meta_expr = None
    risk_context = None
    vendor_context = None

    if group_by == "category":
        value_expr = func.coalesce(Control.control_form, CONTROL_GROUP_UNCATEGORIZED)
        label_expr = value_expr
        from_clause = Control
    elif group_by == "department":
        value_expr = func.coalesce(Department.name, CONTROL_GROUP_UNKNOWN_DEPARTMENT)
        label_expr = value_expr
        from_clause = Control
    elif group_by == "process":
        risk_context = await visible_control_risk_context(db, filtered_ids, current_user)
        value_expr = func.coalesce(func.nullif(risk_context.c.risk_process, ""), CONTROL_GROUP_NO_PROCESS)
        label_expr = value_expr
        from_clause = Control
    elif group_by in {"risk_type", "type"}:
        risk_context = await visible_control_risk_context(db, filtered_ids, current_user)
        value_expr = func.coalesce(func.nullif(risk_context.c.risk_type, ""), CONTROL_GROUP_UNKNOWN_RISK_TYPE)
        label_expr = value_expr
        from_clause = Control
    elif group_by == "risk":
        risk_context = await visible_control_risk_context(db, filtered_ids, current_user)
        value_expr = func.coalesce(func.nullif(risk_context.c.risk_name, ""), CONTROL_GROUP_UNKNOWN_RISK)
        label_expr = value_expr
        meta_expr = {
            "risk_type": func.coalesce(risk_context.c.risk_type, ""),
            "risk_department_name": func.coalesce(risk_context.c.risk_department_name, ""),
            "risk_owner_name": func.coalesce(risk_context.c.risk_owner_name, ""),
        }
        from_clause = Control
    elif group_by == "vendor":
        vendor_context = visible_control_vendor_context(
            filtered_ids,
            current_user,
            can_read_vendors=can_read_vendors,
        )
        value_expr = func.coalesce(
            literal("vendor:") + func.cast(vendor_context.c.vendor_id, String),
            CONTROL_GROUP_UNLINKED_VENDOR,
        )
        label_expr = func.coalesce(vendor_context.c.vendor_name, CONTROL_GROUP_UNLINKED_VENDOR)
        from_clause = Control
    else:
        return []

    selected_columns = [
        value_expr.label("value"),
        label_expr.label("label"),
        func.count(func.distinct(Control.id)).label("count"),
        count_distinct_control_if(active_expr).label("active_count"),
        count_distinct_control_if(highlighted_expr).label("highlighted_count"),
    ]
    if isinstance(meta_expr, dict):
        selected_columns.extend(expr.label(key) for key, expr in meta_expr.items())

    query = select(*selected_columns).select_from(from_clause).join(filtered_ids, filtered_ids.c.id == Control.id)
    if group_by == "department":
        query = query.outerjoin(Department, Department.id == Control.department_id)
    elif risk_context is not None:
        query = query.outerjoin(risk_context, risk_context.c.control_id == Control.id)
    elif vendor_context is not None:
        query = query.outerjoin(vendor_context, vendor_context.c.control_id == Control.id)

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


def control_group_filter(group_by: str, group_value: str, *, risk_context=None, vendor_context=None):
    if group_by == "category":
        return func.coalesce(Control.control_form, CONTROL_GROUP_UNCATEGORIZED) == group_value
    if group_by == "department":
        return func.coalesce(Department.name, CONTROL_GROUP_UNKNOWN_DEPARTMENT) == group_value
    if group_by == "process" and risk_context is not None:
        matching = select(risk_context.c.control_id).where(
            func.coalesce(func.nullif(risk_context.c.risk_process, ""), CONTROL_GROUP_NO_PROCESS) == group_value
        )
        if group_value == CONTROL_GROUP_NO_PROCESS:
            visible_values = select(risk_context.c.control_id).where(
                risk_context.c.risk_process.is_not(None),
                risk_context.c.risk_process != "",
            )
            return or_(Control.id.in_(matching), ~Control.id.in_(visible_values))
        return Control.id.in_(matching)
    if group_by in {"risk_type", "type"} and risk_context is not None:
        matching = select(risk_context.c.control_id).where(
            func.coalesce(func.nullif(risk_context.c.risk_type, ""), CONTROL_GROUP_UNKNOWN_RISK_TYPE) == group_value
        )
        if group_value == CONTROL_GROUP_UNKNOWN_RISK_TYPE:
            visible_values = select(risk_context.c.control_id).where(
                risk_context.c.risk_type.is_not(None),
                risk_context.c.risk_type != "",
            )
            return or_(Control.id.in_(matching), ~Control.id.in_(visible_values))
        return Control.id.in_(matching)
    if group_by == "risk" and risk_context is not None:
        matching = select(risk_context.c.control_id).where(
            func.coalesce(func.nullif(risk_context.c.risk_name, ""), CONTROL_GROUP_UNKNOWN_RISK) == group_value
        )
        if group_value == CONTROL_GROUP_UNKNOWN_RISK:
            visible_values = select(risk_context.c.control_id).where(
                risk_context.c.risk_name.is_not(None),
                risk_context.c.risk_name != "",
            )
            return or_(Control.id.in_(matching), ~Control.id.in_(visible_values))
        return Control.id.in_(matching)
    if group_by == "vendor" and group_value.startswith("vendor:"):
        try:
            vendor_id = int(group_value.removeprefix("vendor:"))
        except ValueError:
            return Control.id.is_(None)
        if vendor_context is None:
            return Control.id.is_(None)
        return Control.id.in_(select(vendor_context.c.control_id).where(vendor_context.c.vendor_id == vendor_id))
    if group_by == "vendor" and group_value == CONTROL_GROUP_UNLINKED_VENDOR and vendor_context is not None:
        return ~Control.id.in_(select(vendor_context.c.control_id))
    return None


def plan_control_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_vendors: bool,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Any, Any],
    total: int,
    get_group_entries: Callable[[ControlSummary, str], list[CollectionGroupEntry]],
) -> RegisterListingPlan:
    async def load_sql_groups(group_by: str):
        return await load_control_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_vendors=can_read_vendors,
        )

    async def build_sql_group_filter(group_by: str, group_value: str | None):
        risk_context = (
            await visible_control_risk_context(db, filtered_ids, current_user)
            if group_by in {"process", "risk_type", "type", "risk"}
            else None
        )
        vendor_context = (
            visible_control_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
            if group_by == "vendor"
            else None
        )
        return control_group_filter(
            group_by,
            group_value or "",
            risk_context=risk_context,
            vendor_context=vendor_context,
        )

    def build_in_memory_grouped_page(all_items, query):
        return build_grouped_collection_page(
            all_items,
            query,
            get_entries=get_group_entries,
            is_active=lambda control: control.status == ControlStatusEnum.active,
            is_highlighted=lambda control: control.risk_level >= 4,
        )

    return _plan_register_listing(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        total=total,
        sql_group_keys=CONTROL_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        build_in_memory_grouped_page=build_in_memory_grouped_page,
    )
