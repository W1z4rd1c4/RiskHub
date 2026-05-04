"""
API endpoints for Key Risk Indicators.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints import _collection_execution as collection_exec
from app.api.v1.endpoints._collection import (
    build_list_context,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)
from app.api.v1.endpoints._monitoring_response import (
    load_monitoring_response_context,
    serialize_kri_response,
)
from app.core.datetime_utils import utc_now
from app.core.pagination import MAX_KRI_PAGE_SIZE
from app.core.permissions import get_kri_ids_where_reporting_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import ApprovalResourceType, KeyRiskIndicator, Risk, User, VendorKRILink
from app.models.global_config import ConfigDefaults, get_config_int
from app.schemas.kri import KRIListResponse
from app.services._authorization_capabilities.common import pending_approvals_for_resources
from app.services._monitoring_status import (
    KRIMonitoringStatus,
    KRITimelinessStatus,
    apply_kri_monitoring_status_filter,
    apply_kri_timeliness_status_filter,
)
from app.services._register_listings.kris import plan_kri_listing
from app.services._register_listings.lifecycle import execute_register_listing_plan
from app.services.authorization_capabilities import kri_capabilities

from ..access import can_create_kri_for_any_parent_risk, kri_read_scope_clause
from ..linked_vendors import visible_linked_vendors

router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])

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

    collection_context = build_list_context(
        offset=effective_offset,
        limit=effective_limit,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=MAX_KRI_PAGE_SIZE,
        legacy_filters={
            "risk_id": risk_id,
            "search": search,
            "breach_only": breach_only,
            "include_archived": include_archived,
            "is_archived": None,
            "monitoring_status": monitoring_status,
            "timeliness_status": timeliness_status,
        },
    )
    collection_query = collection_context.query
    filter_values = collection_context.filters
    risk_id = coerce_optional_int("risk_id", filter_values.get("risk_id"))
    search = coerce_optional_string("search", filter_values.get("search"))
    breach_only = coerce_optional_bool("breach_only", filter_values.get("breach_only")) or False
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    is_archived = coerce_optional_bool("is_archived", filter_values.get("is_archived"))
    monitoring_status_value = filter_values.get("monitoring_status")
    monitoring_status = coerce_optional_enum(KRIMonitoringStatus, monitoring_status_value, "monitoring_status")
    timeliness_status_value = filter_values.get("timeliness_status")
    timeliness_status = coerce_optional_enum(KRITimelinessStatus, timeliness_status_value, "timeliness_status")

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

    async def serialize_kris(kris: list[KeyRiskIndicator]):
        kri_ids = {kri.id for kri in kris}
        approvals_by_kri = await pending_approvals_for_resources(
            db,
            resource_type=ApprovalResourceType.KRI,
            resource_ids=kri_ids,
        )
        high_risk_min_net_score = await get_config_int(
            db,
            "high_risk_min_net_score",
            ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
        )
        reporting_owner_kri_ids = set(await get_kri_ids_where_reporting_owner(db, current_user.id))
        items = []
        for kri in kris:
            capabilities = await kri_capabilities(
                db,
                current_user=current_user,
                kri=kri,
                preloaded_approvals=approvals_by_kri.get(kri.id, []),
                high_risk_min_net_score=high_risk_min_net_score,
                can_read_override=True,
                is_reporting_owner_override=kri.id in reporting_owner_kri_ids,
            )
            items.append(
                serialize_kri_response(
                    kri,
                    monitoring_context,
                    linked_vendors=visible_linked_vendors(current_user, getattr(kri, "vendor_links", [])),
                    capabilities=capabilities,
                )
            )
        return items

    filtered_ids = filtered_query.with_only_columns(KeyRiskIndicator.id).order_by(None).subquery()

    async def load_total() -> int:
        return await collection_exec.count_collection_rows(db, filtered_query)

    listing_plan = plan_kri_listing(
        db=db,
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_kris,
        load_total=load_total,
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=KRIListResponse,
        query=collection_query,
        plan=listing_plan,
    )
