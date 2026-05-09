from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, and_, case, false, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.core.approval_helpers import control_privileged_approval_requirements
from app.core.datetime_utils import utc_now
from app.core.permissions import (
    can_read_vendor,
    get_control_ids_where_owner,
    get_user_department_ids,
    risk_visibility_clause,
    vendor_visibility_clause,
    visible_risk_ids,
)
from app.core.security import check_permission
from app.models import ApprovalResourceType, Control, ControlRiskLink, Risk, User, Vendor, VendorControlLink
from app.models._archivable import archived_clause
from app.models.department import Department
from app.schemas.collection import CollectionGroupRead
from app.schemas.control import (
    ControlFormEnum,
    ControlStatusEnum,
    ControlSummary,
    normalize_control_frequency,
)
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._authorization_capabilities.common import pending_approvals_for_resources
from app.services._collection_contracts import CollectionGroupEntry, build_grouped_collection_page
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)
from app.services._monitoring_response import build_control_monitoring_fields, load_monitoring_response_context
from app.services._monitoring_status import ControlMonitoringStatus, apply_control_monitoring_status_filter
from app.services.authorization_capabilities import control_capabilities

from .lifecycle import CollectionQuery, RegisterListingPlan, SerializeItems, _plan_register_listing

CONTROL_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
CONTROL_GROUP_UNCATEGORIZED = "__uncategorized__"
CONTROL_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
CONTROL_GROUP_NO_PROCESS = "__no_process__"
CONTROL_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
CONTROL_GROUP_UNKNOWN_RISK = "__unknown_risk__"
CONTROL_SQL_GROUPS = {"category", "department", "process", "risk", "risk_type", "type", "vendor"}


@dataclass(frozen=True)
class ControlListingCriteria:
    query: CollectionQuery
    filters: dict[str, Any]


async def apply_control_department_scoping(
    db: AsyncSession,
    query,
    current_user: User,
    department_id_filter: int | None,
):
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        control_owner_ids = await get_control_ids_where_owner(db, current_user.id)
        if control_owner_ids:
            return query.where(
                or_(
                    Control.department_id.in_(dept_ids),
                    Control.id.in_(control_owner_ids),
                )
            )
        return query.where(Control.department_id.in_(dept_ids))
    if department_id_filter:
        return query.where(Control.department_id == department_id_filter)
    return query


def apply_control_process_category_filters(query, process: str | None, category: str | None):
    if not process and not category:
        return query

    query = query.join(Control.risk_links).join(ControlRiskLink.risk)
    if process:
        query = query.where(Risk.process == process)
    if category:
        query = query.where(Risk.category == category)
    return query.distinct()


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
    active_expr = and_(Control.status == ControlStatusEnum.active.value, Control.live())
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
                count=row._mapping["count"],
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
    serialize_items: SerializeItems[Control, ControlSummary],
    total: int,
    get_group_entries: Callable[[ControlSummary, str], list[CollectionGroupEntry]],
) -> RegisterListingPlan[Control, ControlSummary]:
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
            is_active=lambda control: control.status == ControlStatusEnum.active and not control.is_archived,
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


async def build_control_listing_plan(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: ControlListingCriteria,
) -> RegisterListingPlan[Control, ControlSummary]:
    filter_values = criteria.filters
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    status_value = filter_values.get("status")
    archived_status_filter = str(status_value).lower() == "archived" if status_value is not None else False
    status = None if archived_status_filter else coerce_optional_enum(ControlStatusEnum, status_value, "status")
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    search = coerce_optional_string("search", filter_values.get("search"))
    process = coerce_optional_string("process", filter_values.get("process"))
    category = coerce_optional_string("category", filter_values.get("category"))
    monitoring_status = coerce_optional_enum(
        ControlMonitoringStatus,
        filter_values.get("monitoring_status"),
        "monitoring_status",
    )

    base_query = select(Control)
    base_query = await apply_control_department_scoping(db, base_query, current_user, department_id)

    if archived_status_filter:
        base_query = base_query.where(archived_clause(Control, archived=True))
    elif status:
        base_query = base_query.where(Control.status == status.value)
        base_query = base_query.where(archived_clause(Control, archived=False))
    elif not include_archived:
        base_query = base_query.where(archived_clause(Control, archived=False))

    risk_dept = aliased(Department)
    base_query = base_query.outerjoin(Control.department)
    base_query = base_query.outerjoin(Control.risk_links).outerjoin(ControlRiskLink.risk)
    base_query = base_query.outerjoin(risk_dept, Risk.department_id == risk_dept.id)

    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Control.name.ilike(search_pattern),
                Control.description.ilike(search_pattern),
                Department.name.ilike(search_pattern),
                Risk.name.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.risk_id_code.ilike(search_pattern),
                risk_dept.name.ilike(search_pattern),
            )
        )

    base_query = base_query.distinct()
    base_query = apply_control_process_category_filters(base_query, process, category)

    query_options = (
        selectinload(Control.department),
        selectinload(Control.control_owner),
        selectinload(Control.executions),
        selectinload(Control.risk_links)
        .selectinload(ControlRiskLink.risk)
        .options(selectinload(Risk.owner), selectinload(Risk.department)),
        selectinload(Control.vendor_links).selectinload(VendorControlLink.vendor),
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())

    filtered_query = base_query
    if monitoring_status is not None:
        filtered_query = apply_control_monitoring_status_filter(
            filtered_query,
            monitoring_status=monitoring_status,
            today=now.date(),
            execution_stale_days=monitoring_context.control_config.execution_stale_days,
        )

    total = (await db.execute(select(func.count()).select_from(filtered_query.subquery()))).scalar() or 0
    can_read_vendors = check_permission(current_user, "vendors", "read")
    collection_capabilities = {
        "can_create": check_permission(current_user, "controls", "write"),
        "can_export": check_permission(current_user, "reports", "read"),
        "can_view_vendor_contexts": can_read_vendors,
    }
    process_group_entries_by_control_id: dict[int, list[CollectionGroupEntry]] = {}
    risk_group_entries_by_control_id: dict[int, list[CollectionGroupEntry]] = {}

    def risk_group_entry(risk: Risk) -> CollectionGroupEntry:
        value = risk.name or CONTROL_GROUP_UNKNOWN_RISK
        return CollectionGroupEntry(
            value,
            value,
            {
                "risk_type": risk.risk_type or "",
                "risk_department_name": risk.department.name if risk.department else "",
                "risk_owner_name": risk.owner.name if risk.owner else "",
            },
        )

    async def serialize_controls(controls: list[Control]) -> list[ControlSummary]:
        control_ids = {control.id for control in controls}
        approvals_by_control = await pending_approvals_for_resources(
            db,
            resource_type=ApprovalResourceType.CONTROL,
            resource_ids=control_ids,
        )
        owner_control_ids = set(await get_control_ids_where_owner(db, current_user.id))
        privileged_requirements = await control_privileged_approval_requirements(db, control_ids)
        candidate_risk_ids = {
            link.risk_id
            for control in controls
            for link in control.risk_links
            if getattr(link, "risk_id", None) is not None
        }
        readable_risk_ids = await visible_risk_ids(db, current_user, candidate_risk_ids)
        items = []
        for control in controls:
            monitoring_fields = build_control_monitoring_fields(control, monitoring_context)
            capabilities = await control_capabilities(
                db,
                current_user=current_user,
                control=control,
                preloaded_approvals=approvals_by_control.get(control.id, []),
                can_read_override=True,
                is_owner_override=control.id in owner_control_ids,
                requires_privileged_approval=privileged_requirements.get(control.id, False),
            )
            visible_linked_risks = [
                link.risk
                for link in control.risk_links
                if getattr(link, "risk", None) is not None and link.risk.id in readable_risk_ids
            ]
            first_risk = visible_linked_risks[0] if visible_linked_risks else None
            process_entries: list[CollectionGroupEntry] = []
            seen_processes: set[str] = set()
            for risk in visible_linked_risks:
                if risk.process and risk.process not in seen_processes:
                    normalized = group_value(risk.process)
                    process_entries.append(CollectionGroupEntry(normalized, normalized))
                    seen_processes.add(risk.process)
            if not process_entries:
                process_entries = [CollectionGroupEntry(CONTROL_GROUP_NO_PROCESS, CONTROL_GROUP_NO_PROCESS)]
            process_group_entries_by_control_id[control.id] = process_entries
            risk_group_entries_by_control_id[control.id] = (
                [risk_group_entry(risk) for risk in visible_linked_risks]
                if visible_linked_risks
                else [CollectionGroupEntry(CONTROL_GROUP_UNKNOWN_RISK, CONTROL_GROUP_UNKNOWN_RISK)]
            )

            items.append(
                ControlSummary(
                    id=control.id,
                    name=control.name,
                    description=control.description,
                    department_id=control.department_id,
                    department_name=control.department.name if control.department else None,
                    frequency=normalize_control_frequency(control.frequency),
                    risk_level=control.risk_level,
                    status=ControlStatusEnum(control.status),
                    is_archived=control.is_archived,
                    control_form=ControlFormEnum(control.control_form),
                    control_owner_name=control.control_owner.name if control.control_owner else None,
                    risk_type=first_risk.risk_type if first_risk else None,
                    risk_id_code=first_risk.risk_id_code if first_risk else None,
                    risk_description=first_risk.description if first_risk else None,
                    risk_name=first_risk.name if first_risk else None,
                    risk_owner_name=first_risk.owner.name if (first_risk and first_risk.owner) else None,
                    risk_department_name=first_risk.department.name
                    if (first_risk and first_risk.department)
                    else None,
                    linked_vendors=[
                        LinkedVendorRead(
                            id=link.vendor.id,
                            name=link.vendor.name,
                            status=link.vendor.status,
                            is_archived=link.vendor.is_archived,
                        )
                        for link in getattr(control, "vendor_links", []) or []
                        if getattr(link, "vendor", None) is not None
                        and can_read_vendors
                        and can_read_vendor(link.vendor, current_user)
                    ],
                    capabilities=capabilities,
                    **monitoring_fields,
                )
            )
        return items

    def get_control_group_entries(control: ControlSummary, group_by: str) -> list[CollectionGroupEntry]:
        if group_by == "process":
            return process_group_entries_by_control_id.get(
                control.id,
                [CollectionGroupEntry(CONTROL_GROUP_NO_PROCESS, CONTROL_GROUP_NO_PROCESS)],
            )
        if group_by == "risk":
            return risk_group_entries_by_control_id.get(
                control.id,
                [CollectionGroupEntry(CONTROL_GROUP_UNKNOWN_RISK, CONTROL_GROUP_UNKNOWN_RISK)],
            )
        return control_group_entries(control, group_by)

    ordered_query = filtered_query.options(*query_options).order_by(Control.name)
    filtered_ids = filtered_query.with_only_columns(Control.id).order_by(None).subquery()

    return plan_control_listing(
        db=db,
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_controls,
        total=total,
        get_group_entries=get_control_group_entries,
    )
