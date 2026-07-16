from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import build_list_context
from app.core.security import require_permission
from app.db.session import get_db
from app.models import RiskTypeConfig, User
from app.schemas.risk import RiskListResponse
from app.services._register_listings.lifecycle import (
    execute_register_listing_export,
    execute_register_listing_plan,
)
from app.services._register_listings.risks import RiskListingCriteria, plan_risk_listing
from app.services._reporting.risk_control_register_export import render_risk_register_csv

router = APIRouter()


def risk_listing_criteria_dependency(
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[str] = None,
    risk_type: Optional[str] = None,
    is_priority: Optional[bool] = None,
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived risks in results"),
    lifecycle: Literal["active", "archived", "all"] | None = Query(None),
    has_breach: Optional[bool] = None,
    min_net_score: Optional[int] = Query(
        None, ge=0, le=25, description="Filter risks with net_score >= this value (e.g., 15 for critical)"
    ),
    sort_by: Optional[str] = Query(None, description="Field to sort by"),
    sort_order: Optional[str] = Query("asc", description="Sort order (asc or desc)"),
    process: Optional[str] = Query(None, description="Filter by process name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
    ict_linked: bool | None = Query(None),
    above_tolerance: bool | None = Query(None),
    response: str | None = Query(None),
    gross_probability: int | None = Query(None, ge=1, le=5),
    gross_impact: int | None = Query(None, ge=1, le=5),
    gross_band: str | None = Query(None),
    net_band: str | None = Query(None),
) -> RiskListingCriteria:
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
            "risk_type": risk_type,
            "is_priority": is_priority,
            "search": search,
            "include_archived": include_archived,
            "lifecycle": lifecycle,
            "has_breach": has_breach,
            "min_net_score": min_net_score,
            "process": process,
            "category": category,
            "ict_linked": ict_linked,
            "above_tolerance": above_tolerance,
            "response": response,
            "gross_probability": gross_probability,
            "gross_impact": gross_impact,
            "gross_band": gross_band,
            "net_band": net_band,
        },
    )
    return RiskListingCriteria(
        query=collection_context.query,
        filters=collection_context.filters,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("", response_model=RiskListResponse)
async def list_risks(
    criteria: RiskListingCriteria = Depends(risk_listing_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskListResponse:
    """List permission-scoped Risks through the shared collection contract."""
    listing_plan = await plan_risk_listing(
        db=db,
        current_user=current_user,
        criteria=criteria,
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=RiskListResponse,
        query=criteria.query,
        plan=listing_plan,
    )


@router.get("/export")
async def export_risks(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    as_of_date: date | None = Query(
        None,
        description="Point-in-time exports are provided by /reports/risks/export",
    ),
    criteria: RiskListingCriteria = Depends(risk_listing_criteria_dependency),
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
                "message": "Use /api/v1/reports/risks/export for point-in-time Risk exports.",
            },
        )
    listing_plan = await plan_risk_listing(db=db, current_user=current_user, criteria=criteria)
    rows = await execute_register_listing_export(
        db=db,
        query=criteria.query,
        plan=listing_plan,
    )
    risk_type_codes = {
        str(getattr(row.risk_type, "value", row.risk_type))
        for row in rows
        if row.risk_type
    }
    configured_type_labels: dict[str, str] = {}
    if risk_type_codes:
        result = await db.execute(
            select(RiskTypeConfig.code, RiskTypeConfig.display_name).where(
                RiskTypeConfig.code.in_(risk_type_codes)
            )
        )
        configured_type_labels = dict(result.all())
    return render_risk_register_csv(
        rows,
        locale=locale,
        configured_type_labels=configured_type_labels,
    )
