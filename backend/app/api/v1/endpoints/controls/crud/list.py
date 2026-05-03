from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    build_grouped_collection_page,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
    is_group_summary_request,
    merge_collection_filters,
    parse_collection_query,
)
from app.api.v1.endpoints._monitoring_response import (
    build_control_monitoring_fields,
    load_monitoring_response_context,
)
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_vendor, visible_risk_ids
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Control, ControlRiskLink, Risk, User, Vendor, VendorControlLink
from app.models.department import Department
from app.schemas.collection import CollectionGroupRead
from app.schemas.control import (
    ControlFormEnum,
    ControlListResponse,
    ControlStatusEnum,
    ControlSummary,
    normalize_control_frequency,
)
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_status import ControlMonitoringStatus, apply_control_monitoring_status_filter
from app.services.authorization_capabilities import control_capabilities

from .._helpers import _apply_department_scoping, _apply_process_category_filters

router = APIRouter()

CONTROL_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
CONTROL_GROUP_UNCATEGORIZED = "__uncategorized__"
CONTROL_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
CONTROL_GROUP_NO_PROCESS = "__no_process__"
CONTROL_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
CONTROL_GROUP_UNKNOWN_RISK = "__unknown_risk__"
CONTROL_SQL_GROUPS = {"category", "department", "process", "risk", "risk_type", "type", "vendor"}


def _group_value(value) -> str:
    return str(getattr(value, "value", value))


def _control_group_entries(control: ControlSummary, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "vendor":
        vendors = control.linked_vendors or []
        if not vendors:
            return [CollectionGroupEntry(CONTROL_GROUP_UNLINKED_VENDOR, CONTROL_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(f"vendor:{vendor.id}", vendor.name) for vendor in vendors]

    if group_by == "category":
        value = control.control_form or CONTROL_GROUP_UNCATEGORIZED
        return [CollectionGroupEntry(_group_value(value), _group_value(value))]

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


def _count_distinct_control_if(condition):
    return func.count(func.distinct(case((condition, Control.id))))


async def _load_control_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    can_read_vendors: bool,
) -> list[CollectionGroupRead]:
    active_expr = Control.status == ControlStatusEnum.active.value
    highlighted_expr = Control.risk_level >= 4
    meta_expr = None

    if group_by == "category":
        value_expr = func.coalesce(Control.control_form, CONTROL_GROUP_UNCATEGORIZED)
        label_expr = value_expr
        from_clause = Control
    elif group_by == "department":
        value_expr = func.coalesce(Department.name, CONTROL_GROUP_UNKNOWN_DEPARTMENT)
        label_expr = value_expr
        from_clause = Control
    elif group_by == "process":
        value_expr = func.coalesce(Risk.process, CONTROL_GROUP_NO_PROCESS)
        label_expr = value_expr
        from_clause = Control
    elif group_by in {"risk_type", "type"}:
        value_expr = func.coalesce(Risk.risk_type, CONTROL_GROUP_UNKNOWN_RISK_TYPE)
        label_expr = value_expr
        from_clause = Control
    elif group_by == "risk":
        value_expr = func.coalesce(Risk.name, CONTROL_GROUP_UNKNOWN_RISK)
        label_expr = value_expr
        meta_expr = {
            "risk_type": func.coalesce(Risk.risk_type, ""),
            "risk_department_name": func.coalesce(Department.name, ""),
            "risk_owner_name": literal(""),
        }
        from_clause = Control
    elif group_by == "vendor" and can_read_vendors:
        value_expr = literal("vendor:") + func.cast(Vendor.id, String)
        label_expr = Vendor.name
        from_clause = Control
    elif group_by == "vendor":
        value_expr = literal(CONTROL_GROUP_UNLINKED_VENDOR)
        label_expr = value_expr
        from_clause = Control
    else:
        return []

    selected_columns = [
        value_expr.label("value"),
        label_expr.label("label"),
        func.count(func.distinct(Control.id)).label("count"),
        _count_distinct_control_if(active_expr).label("active_count"),
        _count_distinct_control_if(highlighted_expr).label("highlighted_count"),
    ]
    if isinstance(meta_expr, dict):
        selected_columns.extend(expr.label(key) for key, expr in meta_expr.items())

    query = (
        select(*selected_columns)
        .select_from(from_clause)
        .join(filtered_ids, filtered_ids.c.id == Control.id)
    )

    if group_by == "department":
        query = query.outerjoin(Department, Department.id == Control.department_id)
    elif group_by in {"process", "risk_type", "type", "risk"}:
        query = query.join(ControlRiskLink, ControlRiskLink.control_id == Control.id).join(
            Risk, Risk.id == ControlRiskLink.risk_id
        )
        if group_by == "risk":
            query = query.outerjoin(Department, Department.id == Risk.department_id)
    elif group_by == "vendor" and can_read_vendors:
        query = query.join(VendorControlLink, VendorControlLink.control_id == Control.id).join(
            Vendor, Vendor.id == VendorControlLink.vendor_id
        )

    group_columns = [value_expr, label_expr]
    if isinstance(meta_expr, dict):
        group_columns.extend(meta_expr.values())
    query = query.group_by(*group_columns).order_by(func.lower(label_expr))

    groups = []
    for row in (await db.execute(query)).all():
        meta = {}
        if isinstance(meta_expr, dict):
            meta = {key: getattr(row, key, "") for key in meta_expr}
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


def _control_group_filter(group_by: str, group_value: str):
    if group_by == "category":
        return func.coalesce(Control.control_form, CONTROL_GROUP_UNCATEGORIZED) == group_value
    if group_by == "department":
        return func.coalesce(Department.name, CONTROL_GROUP_UNKNOWN_DEPARTMENT) == group_value
    if group_by == "process":
        return Control.id.in_(
            select(ControlRiskLink.control_id)
            .join(Risk, Risk.id == ControlRiskLink.risk_id)
            .where(func.coalesce(Risk.process, CONTROL_GROUP_NO_PROCESS) == group_value)
        )
    if group_by in {"risk_type", "type"}:
        return Control.id.in_(
            select(ControlRiskLink.control_id)
            .join(Risk, Risk.id == ControlRiskLink.risk_id)
            .where(func.coalesce(Risk.risk_type, CONTROL_GROUP_UNKNOWN_RISK_TYPE) == group_value)
        )
    if group_by == "risk":
        return Control.id.in_(
            select(ControlRiskLink.control_id)
            .join(Risk, Risk.id == ControlRiskLink.risk_id)
            .where(func.coalesce(Risk.name, CONTROL_GROUP_UNKNOWN_RISK) == group_value)
        )
    if group_by == "vendor" and group_value.startswith("vendor:"):
        try:
            vendor_id = int(group_value.removeprefix("vendor:"))
        except ValueError:
            return Control.id.is_(None)
        return Control.id.in_(select(VendorControlLink.control_id).where(VendorControlLink.vendor_id == vendor_id))
    if group_by == "vendor" and group_value == CONTROL_GROUP_UNLINKED_VENDOR:
        return ~Control.id.in_(select(VendorControlLink.control_id))
    return None


@router.get("", response_model=ControlListResponse)
async def list_controls(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[ControlStatusEnum] = None,
    include_archived: bool = Query(False, description="Include archived controls in results"),
    search: Optional[str] = None,
    process: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    monitoring_status: Optional[ControlMonitoringStatus] = Query(None),
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
):
    """
    List controls with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's controls.
    Also includes controls where user is the control owner.
    Returns paginated response with total count.
    """
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
            "department_id": department_id,
            "status": status.value if status else None,
            "include_archived": include_archived,
            "search": search,
            "process": process,
            "category": category,
            "monitoring_status": monitoring_status,
        },
    )
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    status_value = filter_values.get("status")
    status = coerce_optional_enum(ControlStatusEnum, status_value, "status")
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    search = coerce_optional_string("search", filter_values.get("search"))
    process = coerce_optional_string("process", filter_values.get("process"))
    category = coerce_optional_string("category", filter_values.get("category"))
    monitoring_status_value = filter_values.get("monitoring_status")
    monitoring_status = coerce_optional_enum(
        ControlMonitoringStatus, monitoring_status_value, "monitoring_status"
    )
    offset = collection_query.offset
    limit = collection_query.limit

    base_query = select(Control)

    # Apply department-based scoping
    base_query = await _apply_department_scoping(db, base_query, current_user, department_id)

    # Status filter
    if status:
        base_query = base_query.where(Control.status == status.value)
    elif not include_archived:
        # Default: exclude archived
        base_query = base_query.where(Control.status != ControlStatusEnum.archived.value)

    # Join for secondary search fields (Risk via ControlRiskLink)
    from sqlalchemy.orm import aliased

    RiskDept = aliased(Department)

    base_query = base_query.outerjoin(Control.department)
    base_query = base_query.outerjoin(Control.risk_links).outerjoin(ControlRiskLink.risk)
    base_query = base_query.outerjoin(RiskDept, Risk.department_id == RiskDept.id)

    # Search filter
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
                RiskDept.name.ilike(search_pattern),
            )
        )

    # Distinct because of risk joins
    base_query = base_query.distinct()

    # Apply optional process/category filters
    base_query = _apply_process_category_filters(base_query, process, category)

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

    count_query = select(func.count()).select_from(filtered_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Map to summary with department_name and risk info
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
        candidate_risk_ids = {
            link.risk_id
            for control in controls
            for link in control.risk_links
            if getattr(link, "risk_id", None) is not None
        }
        readable_risk_ids = await visible_risk_ids(db, current_user, candidate_risk_ids)
        items = []
        for c in controls:
            monitoring_fields = build_control_monitoring_fields(c, monitoring_context)
            capabilities = await control_capabilities(db, current_user=current_user, control=c)
            visible_linked_risks = [
                link.risk
                for link in c.risk_links
                if getattr(link, "risk", None) is not None and link.risk.id in readable_risk_ids
            ]
            first_risk = visible_linked_risks[0] if visible_linked_risks else None
            process_entries: list[CollectionGroupEntry] = []
            seen_processes: set[str] = set()
            for risk in visible_linked_risks:
                if risk.process and risk.process not in seen_processes:
                    process_entries.append(
                        CollectionGroupEntry(_group_value(risk.process), _group_value(risk.process))
                    )
                    seen_processes.add(risk.process)
            if not process_entries:
                process_entries = [CollectionGroupEntry(CONTROL_GROUP_NO_PROCESS, CONTROL_GROUP_NO_PROCESS)]
            process_group_entries_by_control_id[c.id] = process_entries
            risk_group_entries_by_control_id[c.id] = (
                [risk_group_entry(risk) for risk in visible_linked_risks]
                if visible_linked_risks
                else [CollectionGroupEntry(CONTROL_GROUP_UNKNOWN_RISK, CONTROL_GROUP_UNKNOWN_RISK)]
            )

            items.append(
                ControlSummary(
                    id=c.id,
                    name=c.name,
                    description=c.description,
                    department_id=c.department_id,
                    department_name=c.department.name if c.department else None,
                    frequency=normalize_control_frequency(c.frequency),
                    risk_level=c.risk_level,
                    status=ControlStatusEnum(c.status),
                    control_form=ControlFormEnum(c.control_form),
                    control_owner_name=c.control_owner.name if c.control_owner else None,
                    risk_type=first_risk.risk_type if first_risk else None,
                    risk_id_code=first_risk.risk_id_code if first_risk else None,
                    risk_description=first_risk.description if first_risk else None,
                    risk_name=first_risk.name if first_risk else None,
                    risk_owner_name=first_risk.owner.name if (first_risk and first_risk.owner) else None,
                    risk_department_name=first_risk.department.name
                    if (first_risk and first_risk.department)
                    else None,
                    linked_vendors=[
                        LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
                        for link in getattr(c, "vendor_links", []) or []
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
        return _control_group_entries(control, group_by)

    ordered_query = filtered_query.options(*query_options).order_by(Control.name)

    if collection_query.group_by and collection_query.group_by in CONTROL_SQL_GROUPS:
        filtered_ids = filtered_query.with_only_columns(Control.id).order_by(None).subquery()
        groups = await _load_control_sql_groups(
            db,
            filtered_ids,
            collection_query.group_by,
            can_read_vendors=can_read_vendors,
        )
        if is_group_summary_request(collection_query):
            return ControlListResponse(
                items=[],
                total=total,
                offset=offset,
                limit=limit,
                groups=groups,
                capabilities=collection_capabilities,
            )

        group_filter = _control_group_filter(collection_query.group_by, collection_query.group_value or "")
        grouped_query = ordered_query.where(group_filter) if group_filter is not None else ordered_query
        grouped_total = (
            await db.execute(select(func.count()).select_from(grouped_query.order_by(None).subquery()))
        ).scalar() or 0
        result = await db.execute(grouped_query.offset(offset).limit(limit))
        paginated_items = await serialize_controls(list(result.scalars().all()))
        return ControlListResponse(
            items=paginated_items,
            total=grouped_total,
            offset=offset,
            limit=limit,
            groups=groups,
            capabilities=collection_capabilities,
        )

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        all_items = await serialize_controls(list(result.scalars().all()))
        paginated_items, grouped_total, groups = build_grouped_collection_page(
            all_items,
            collection_query,
            get_entries=get_control_group_entries,
            is_active=lambda control: control.status == ControlStatusEnum.active,
            is_highlighted=lambda control: control.risk_level >= 4,
        )
        return ControlListResponse(
            items=paginated_items,
            total=grouped_total,
            offset=offset,
            limit=limit,
            groups=groups,
            capabilities=collection_capabilities,
        )

    result = await db.execute(ordered_query.offset(offset).limit(limit))
    items = await serialize_controls(list(result.scalars().all()))

    return ControlListResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        capabilities=collection_capabilities,
    )
