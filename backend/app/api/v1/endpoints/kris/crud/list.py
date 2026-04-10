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


@router.get("", response_model=KRIListResponse)
async def list_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    risk_id: Optional[int] = Query(None, description="Filter by risk ID"),
    search: Optional[str] = Query(None, description="Search by metric name"),
    breach_only: bool = Query(False, description="Only return breached KRIs"),
    include_archived: bool = Query(False, description="Include archived KRIs"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=MAX_KRI_PAGE_SIZE),
    monitoring_status: Optional[KRIMonitoringStatus] = Query(None),
    timeliness_status: Optional[KRITimelinessStatus] = Query(None),
):
    """List all KRIs with optional filters."""
    from app.core.permissions import get_kri_ids_where_reporting_owner

    if monitoring_status is not None and timeliness_status is not None:
        raise HTTPException(
            status_code=422,
            detail="monitoring_status and timeliness_status cannot be used together",
        )

    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)

    # Exclude archived KRIs by default
    if not include_archived:
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

    count_query = select(func.count()).select_from(filtered_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    result = await db.execute(
        filtered_query.order_by(KeyRiskIndicator.metric_name).offset((page - 1) * size).limit(size)
    )
    kris = result.scalars().all()
    can_read_vendors = check_permission(current_user, "vendors", "read")
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

    return KRIListResponse(items=items, total=total, page=page, size=size)
