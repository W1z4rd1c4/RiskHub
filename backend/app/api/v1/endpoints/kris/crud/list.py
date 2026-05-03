"""
API endpoints for Key Risk Indicators.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, case, false, func, literal, or_, select
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
    load_monitoring_response_context,
    serialize_kri_response,
)
from app.core.datetime_utils import utc_now
from app.core.pagination import MAX_KRI_PAGE_SIZE
from app.core.permissions import vendor_visibility_clause
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Department, KeyRiskIndicator, Risk, User, Vendor, VendorKRILink
from app.schemas.collection import CollectionGroupRead
from app.schemas.kri import KRIListResponse
from app.services._monitoring_status import (
    KRIMonitoringStatus,
    KRITimelinessStatus,
    apply_kri_monitoring_status_filter,
    apply_kri_timeliness_status_filter,
)
from app.services.authorization_capabilities import kri_capabilities

from ..access import can_create_kri_for_any_parent_risk, kri_read_scope_clause
from ..linked_vendors import visible_linked_vendors

router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])

KRI_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
KRI_GROUP_UNCATEGORIZED = "__uncategorized__"
KRI_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
KRI_GROUP_NO_PROCESS = "__no_process__"
KRI_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
KRI_GROUP_UNKNOWN_RISK = "__unknown_risk__"
KRI_SQL_GROUPS = {"category", "department", "process", "risk", "risk_type", "type", "vendor"}


def _kri_group_entries(kri, group_by: str) -> list[CollectionGroupEntry]:
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


def _count_distinct_kri_if(condition):
    return func.count(func.distinct(case((condition, KeyRiskIndicator.id))))


def _visible_kri_vendor_context(filtered_ids, current_user: User, *, can_read_vendors: bool):
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


async def _load_kri_sql_groups(
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
        vendor_context = _visible_kri_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
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
        _count_distinct_kri_if(active_expr).label("active_count"),
        _count_distinct_kri_if(breach_expr).label("highlighted_count"),
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


def _kri_group_filter(group_by: str, group_value: str, *, vendor_context=None):
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


@router.get("", response_model=KRIListResponse)
async def list_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    risk_id: Optional[int] = Query(None, description="Filter by risk ID"),
    search: Optional[str] = Query(None, description="Search by metric name"),
    breach_only: bool = Query(False, description="Only return breached KRIs"),
    include_archived: bool = Query(False, description="Include archived KRIs"),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(20, ge=1, le=MAX_KRI_PAGE_SIZE),
    page: int | None = Query(None, ge=1),
    size: int | None = Query(None, ge=1, le=MAX_KRI_PAGE_SIZE),
    monitoring_status: Optional[KRIMonitoringStatus] = Query(None),
    timeliness_status: Optional[KRITimelinessStatus] = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
):
    """List all KRIs with optional filters."""
    effective_limit = size if size is not None else limit
    effective_offset = skip if skip is not None else offset
    if page is not None:
        effective_offset = (page - 1) * effective_limit

    collection_query = parse_collection_query(
        offset=effective_offset,
        limit=effective_limit,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=MAX_KRI_PAGE_SIZE,
    )
    filter_values = merge_collection_filters(
        collection_query,
        {
            "risk_id": risk_id,
            "search": search,
            "breach_only": breach_only,
            "include_archived": include_archived,
            "is_archived": None,
            "monitoring_status": monitoring_status,
            "timeliness_status": timeliness_status,
        },
    )
    risk_id = coerce_optional_int("risk_id", filter_values.get("risk_id"))
    search = coerce_optional_string("search", filter_values.get("search"))
    breach_only = coerce_optional_bool("breach_only", filter_values.get("breach_only")) or False
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    is_archived = coerce_optional_bool("is_archived", filter_values.get("is_archived"))
    monitoring_status_value = filter_values.get("monitoring_status")
    monitoring_status = coerce_optional_enum(KRIMonitoringStatus, monitoring_status_value, "monitoring_status")
    timeliness_status_value = filter_values.get("timeliness_status")
    timeliness_status = coerce_optional_enum(KRITimelinessStatus, timeliness_status_value, "timeliness_status")
    offset = collection_query.offset
    limit = collection_query.limit

    if monitoring_status is not None and timeliness_status is not None:
        raise HTTPException(
            status_code=422,
            detail="monitoring_status and timeliness_status cannot be used together",
        )

    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)

    if is_archived is not None:
        query = query.where(KeyRiskIndicator.is_archived.is_(is_archived))
    elif not include_archived:
        query = query.where(KeyRiskIndicator.is_archived.is_(False))

    visibility_clause = await kri_read_scope_clause(db, current_user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)

    if risk_id:
        query = query.where(KeyRiskIndicator.risk_id == risk_id)

    if search:
        search_term = f"%{search.strip().lower()}%"
        query = query.where(func.lower(KeyRiskIndicator.metric_name).like(search_term))

    # Apply breach filter BEFORE count and pagination
    if breach_only:
        query = query.where(
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
            )
        )

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).options(selectinload(Risk.owner), selectinload(Risk.department)),
        selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())

    filtered_query = query
    if monitoring_status is not None:
        filtered_query = apply_kri_monitoring_status_filter(
            filtered_query,
            monitoring_status=monitoring_status,
            today=now.date(),
            warning_upper_margin_ratio=monitoring_context.kri_config.warning_upper_margin_ratio,
        )
    elif timeliness_status is not None:
        filtered_query = apply_kri_timeliness_status_filter(
            filtered_query,
            timeliness_status=timeliness_status,
            today=now.date(),
        )

    can_read_vendors = check_permission(current_user, "vendors", "read")
    collection_capabilities = {
        "can_create": await can_create_kri_for_any_parent_risk(db, current_user),
        "can_export": check_permission(current_user, "reports", "read"),
        "can_view_vendor_contexts": can_read_vendors,
    }
    ordered_query = filtered_query.order_by(KeyRiskIndicator.metric_name)

    if collection_query.group_by and collection_query.group_by in KRI_SQL_GROUPS:
        filtered_ids = filtered_query.with_only_columns(KeyRiskIndicator.id).order_by(None).subquery()
        vendor_context = (
            _visible_kri_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
            if collection_query.group_by == "vendor"
            else None
        )
        groups = await _load_kri_sql_groups(
            db,
            filtered_ids,
            collection_query.group_by,
            current_user=current_user,
            can_read_vendors=can_read_vendors,
        )
        count_query = select(func.count()).select_from(filtered_query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        if is_group_summary_request(collection_query):
            return KRIListResponse(
                items=[],
                total=total,
                offset=offset,
                limit=limit,
                groups=groups,
                capabilities=collection_capabilities,
            )

        group_filter = _kri_group_filter(
            collection_query.group_by,
            collection_query.group_value or "",
            vendor_context=vendor_context,
        )
        grouped_query = ordered_query.outerjoin(Department, Department.id == Risk.department_id)
        if group_filter is not None:
            grouped_query = grouped_query.where(group_filter)
        else:
            grouped_query = grouped_query.where(false())
        grouped_total = (
            await db.execute(select(func.count()).select_from(grouped_query.order_by(None).subquery()))
        ).scalar() or 0
        result = await db.execute(grouped_query.offset(offset).limit(limit))
        kris = result.scalars().all()
        items = []
        for kri in kris:
            capabilities = await kri_capabilities(db, current_user=current_user, kri=kri)
            items.append(
                serialize_kri_response(
                    kri,
                    monitoring_context,
                    linked_vendors=visible_linked_vendors(current_user, getattr(kri, "vendor_links", [])),
                    capabilities=capabilities,
                )
            )
        return KRIListResponse(
            items=items,
            total=grouped_total,
            offset=offset,
            limit=limit,
            groups=groups,
            capabilities=collection_capabilities,
        )

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        kris = result.scalars().all()
        all_items = []
        for kri in kris:
            capabilities = await kri_capabilities(db, current_user=current_user, kri=kri)
            all_items.append(
                serialize_kri_response(
                    kri,
                    monitoring_context,
                    linked_vendors=visible_linked_vendors(current_user, getattr(kri, "vendor_links", [])),
                    capabilities=capabilities,
                )
            )
        paginated_items, total, groups = build_grouped_collection_page(
            all_items,
            collection_query,
            get_entries=_kri_group_entries,
            is_highlighted=lambda item: getattr(item, "monitoring_status", None) == "breach",
        )
        return KRIListResponse(
            items=paginated_items,
            total=total,
            offset=offset,
            limit=limit,
            groups=groups,
            capabilities=collection_capabilities,
        )

    count_query = select(func.count()).select_from(filtered_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    result = await db.execute(ordered_query.offset(offset).limit(limit))
    kris = result.scalars().all()
    items = []
    for kri in kris:
        capabilities = await kri_capabilities(db, current_user=current_user, kri=kri)
        items.append(
            serialize_kri_response(
                kri,
                monitoring_context,
                linked_vendors=visible_linked_vendors(current_user, getattr(kri, "vendor_links", [])),
                capabilities=capabilities,
            )
        )

    return KRIListResponse(items=items, total=total, offset=offset, limit=limit, capabilities=collection_capabilities)
