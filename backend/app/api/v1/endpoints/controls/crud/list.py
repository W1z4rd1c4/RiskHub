from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import build_list_context
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.control import (
    ControlListResponse,
)
from app.services._monitoring_status import ControlMonitoringStatus
from app.services._register_listings.controls import (
    ControlListingCriteria,
    build_control_listing_plan,
)
from app.services._register_listings.lifecycle import (
    execute_register_listing_export,
    execute_register_listing_plan,
)
from app.services._reporting.risk_control_register_export import render_control_register_csv

router = APIRouter()


def control_listing_criteria_dependency(
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived controls in results"),
    lifecycle: Literal["active", "archived", "all"] | None = Query(None),
    search: Optional[str] = None,
    process: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    monitoring_status: Optional[ControlMonitoringStatus] = Query(None),
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
) -> ControlListingCriteria:
    collection_context = build_list_context(
        offset=skip if skip is not None else offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=100,
        legacy_filters={
            "department_id": department_id,
            "status": status,
            "include_archived": include_archived,
            "lifecycle": lifecycle,
            "search": search,
            "process": process,
            "category": category,
            "monitoring_status": monitoring_status,
        },
    )
    return ControlListingCriteria(
        query=collection_context.query,
        filters=collection_context.filters,
    )


@router.get("", response_model=ControlListResponse)
async def list_controls(
    criteria: ControlListingCriteria = Depends(control_listing_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
):
    """List permission-scoped Controls through the shared collection contract."""
    listing_plan = await build_control_listing_plan(
        db=db,
        current_user=current_user,
        criteria=criteria,
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=ControlListResponse,
        query=criteria.query,
        plan=listing_plan,
    )


@router.get("/export")
async def export_controls(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    as_of_date: date | None = Query(
        None,
        description="Point-in-time exports are provided by /reports/controls/export",
    ),
    criteria: ControlListingCriteria = Depends(control_listing_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    _reporting_user: User = Depends(require_permission("reports", "read")),
):
    del format
    if as_of_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "point_in_time_export_requires_report",
                "message": "Use /api/v1/reports/controls/export for point-in-time Control exports.",
            },
        )
    listing_plan = await build_control_listing_plan(db=db, current_user=current_user, criteria=criteria)
    rows = await execute_register_listing_export(
        db=db,
        query=criteria.query,
        plan=listing_plan,
    )
    return render_control_register_csv(rows, locale=locale)
