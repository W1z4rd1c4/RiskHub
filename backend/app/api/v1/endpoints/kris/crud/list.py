"""
API endpoints for Key Risk Indicators.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import build_list_context
from app.core.pagination import MAX_KRI_PAGE_SIZE
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.kri import KRIListResponse
from app.services._monitoring_status import (
    KRIMonitoringStatus,
    KRITimelinessStatus,
)
from app.services._register_listings.kris import KRIListingCriteria, build_kri_listing_plan
from app.services._register_listings.lifecycle import execute_register_listing_plan

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
    listing_plan = await build_kri_listing_plan(
        db=db,
        current_user=current_user,
        criteria=KRIListingCriteria(query=collection_query, filters=collection_context.filters),
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=KRIListResponse,
        query=collection_query,
        plan=listing_plan,
    )
