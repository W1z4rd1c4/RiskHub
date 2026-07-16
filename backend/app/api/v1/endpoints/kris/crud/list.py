"""API endpoints for Key Risk Indicator collections."""

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import CollectionListContext, build_list_context
from app.core.datetime_utils import utc_now
from app.core.pagination import MAX_KRI_PAGE_SIZE
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.key_risk_indicator import KRIFrequency
from app.schemas.kri import KRIListResponse
from app.services._collection_contracts import CollectionSort
from app.services._monitoring_status import (
    KRIMonitoringStatus,
    KRITimelinessStatus,
    get_kri_monitoring_config,
)
from app.services._monitoring_status.export_rows import apply_kri_monitoring_rows
from app.services._register_listings.kris import (
    KRIListingCriteria,
    build_kri_listing_plan,
    effective_kri_lifecycle,
)
from app.services._register_listings.lifecycle import (
    execute_register_listing_plan,
    load_register_listing_export_models,
)
from app.services._reporting.exports.rows import _kri_to_row
from app.services._reporting.kri_issue_register_export import render_kri_register_csv

router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])


def kri_listing_criteria_dependency(
    risk_id: Optional[int] = Query(None, description="Filter by risk ID"),
    department_id: int | None = Query(None, ge=1),
    reporting_owner_id: int | None = Query(None, ge=1),
    frequency: KRIFrequency | None = Query(None),
    search: Optional[str] = Query(None, description="Search by metric name"),
    breach_only: bool = Query(False, description="Only return breached KRIs"),
    include_archived: bool = Query(False, description="Include archived KRIs"),
    lifecycle: Literal["active", "archived", "all"] | None = Query(None),
    is_archived: bool | None = Query(None),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(20, ge=1, le=MAX_KRI_PAGE_SIZE),
    page: int | None = Query(None, ge=1),
    size: int | None = Query(None, ge=1, le=MAX_KRI_PAGE_SIZE),
    monitoring_status: Optional[KRIMonitoringStatus] = Query(None),
    timeliness_status: Optional[KRITimelinessStatus] = Query(None),
    filters: str | None = Query(None),
    sort: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: Literal["asc", "desc"] | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
) -> KRIListingCriteria:
    effective_limit = size if size is not None else limit
    effective_offset = skip if skip is not None else offset
    if page is not None:
        effective_offset = (page - 1) * effective_limit

    collection_context = build_list_context(
        offset=effective_offset,
        limit=effective_limit,
        filters=filters,
        sort=sort,
        group_by=group_by,
        group_value=group_value,
        max_limit=MAX_KRI_PAGE_SIZE,
        legacy_filters={
            "risk_id": risk_id,
            "department_id": department_id,
            "reporting_owner_id": reporting_owner_id,
            "frequency": frequency,
            "search": search,
            "breach_only": breach_only,
            "include_archived": include_archived,
            "lifecycle": lifecycle,
            "is_archived": is_archived,
            "monitoring_status": monitoring_status,
            "timeliness_status": timeliness_status,
        },
    )
    if collection_context.query.sort is None and sort_by is not None:
        collection_context = CollectionListContext(
            query=collection_context.query.model_copy(
                update={"sort": CollectionSort(field=sort_by, direction=sort_order or "asc")}
            ),
            filters=collection_context.filters,
        )
    return KRIListingCriteria(query=collection_context.query, filters=collection_context.filters)


@router.get("", response_model=KRIListResponse)
async def list_kris(
    criteria: KRIListingCriteria = Depends(kri_listing_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """List permission-scoped KRIs through the shared collection contract."""
    listing_plan = await build_kri_listing_plan(
        db=db,
        current_user=current_user,
        criteria=criteria,
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=KRIListResponse,
        query=criteria.query,
        plan=listing_plan,
    )


@router.get("/export")
async def export_kris(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    as_of_date: date | None = Query(
        None,
        description="Point-in-time exports are provided by /reports/kris/export",
    ),
    criteria: KRIListingCriteria = Depends(kri_listing_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    _reporting_user: User = Depends(require_permission("reports", "read")),
):
    del format
    if as_of_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "point_in_time_export_requires_report",
                "message": "Use /api/v1/reports/kris/export for point-in-time KRI exports.",
            },
        )

    listing_plan = await build_kri_listing_plan(db=db, current_user=current_user, criteria=criteria)
    models = await load_register_listing_export_models(
        db=db,
        query=criteria.query,
        plan=listing_plan,
    )
    rows = [
        {**_kri_to_row(kri), "effective_lifecycle": effective_kri_lifecycle(kri)}
        for kri in models
    ]
    config = await get_kri_monitoring_config(db)
    rows = apply_kri_monitoring_rows(rows, config=config, as_of_date=utc_now().date())
    return render_kri_register_csv(rows, locale=locale)
