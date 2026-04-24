"""
API endpoints for Key Risk Indicators.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import (
    load_monitoring_response_context,
    serialize_kri_response,
)
from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    build_grouped_collection_page,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
    merge_collection_filters,
    parse_collection_query,
)
from app.core.datetime_utils import utc_now
from app.core.pagination import MAX_KRI_PAGE_SIZE
from app.core.permissions import can_read_vendor, get_user_department_ids
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.schemas.kri import KRIListResponse
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_status import (
    KRIMonitoringStatus,
    KRITimelinessStatus,
    apply_kri_monitoring_status_filter,
    apply_kri_timeliness_status_filter,
)

router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])

KRI_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
KRI_GROUP_UNCATEGORIZED = "__uncategorized__"
KRI_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
KRI_GROUP_NO_PROCESS = "__no_process__"
KRI_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
KRI_GROUP_UNKNOWN_RISK = "__unknown_risk__"


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
    from app.core.permissions import get_kri_ids_where_reporting_owner

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

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        # Include KRIs from user's departments OR where user is reporting owner
        reporting_owner_kri_ids = await get_kri_ids_where_reporting_owner(db, current_user.id)
        if reporting_owner_kri_ids:
            query = query.filter(
                or_(
                    Risk.department_id.in_(dept_ids),
                    KeyRiskIndicator.id.in_(reporting_owner_kri_ids),
                )
            )
        else:
            query = query.filter(Risk.department_id.in_(dept_ids))

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
    ordered_query = filtered_query.order_by(KeyRiskIndicator.metric_name)

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        kris = result.scalars().all()
        all_items = [
            serialize_kri_response(
                kri,
                monitoring_context,
                linked_vendors=[
                    LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
                    for link in getattr(kri, "vendor_links", []) or []
                    if getattr(link, "vendor", None) is not None
                    and can_read_vendors
                    and can_read_vendor(link.vendor, current_user)
                ],
            )
            for kri in kris
        ]
        paginated_items, total, groups = build_grouped_collection_page(
            all_items,
            collection_query,
            get_entries=_kri_group_entries,
            is_highlighted=lambda item: getattr(item, "monitoring_status", None) == "breach",
        )
        return KRIListResponse(items=paginated_items, total=total, offset=offset, limit=limit, groups=groups)

    count_query = select(func.count()).select_from(filtered_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    result = await db.execute(ordered_query.offset(offset).limit(limit))
    kris = result.scalars().all()
    items = [
        serialize_kri_response(
            kri,
            monitoring_context,
            linked_vendors=[
                LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
                for link in getattr(kri, "vendor_links", []) or []
                if getattr(link, "vendor", None) is not None
                and can_read_vendors
                and can_read_vendor(link.vendor, current_user)
            ],
        )
        for kri in kris
    ]

    return KRIListResponse(items=items, total=total, offset=offset, limit=limit)
