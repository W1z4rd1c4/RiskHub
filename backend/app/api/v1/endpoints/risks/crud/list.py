from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import build_list_context
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.risk import RiskListResponse
from app.services._register_listings.lifecycle import execute_register_listing_plan
from app.services._register_listings.risks import RiskListingCriteria, plan_risk_listing

router = APIRouter()

@router.get("", response_model=RiskListResponse)
async def list_risks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[str] = None,
    risk_type: Optional[str] = None,
    is_priority: Optional[bool] = None,
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived risks in results"),
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
) -> RiskListResponse:
    """
    List risks with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's risks.
    Also includes risks where user is reporting owner of any linked KRI or control owner.
    Returns paginated response with total count.
    """
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
            "has_breach": has_breach,
            "min_net_score": min_net_score,
            "process": process,
            "category": category,
        },
    )
    collection_query = collection_context.query
    listing_plan = await plan_risk_listing(
        db=db,
        current_user=current_user,
        criteria=RiskListingCriteria(
            query=collection_query,
            filters=collection_context.filters,
            sort_by=sort_by,
            sort_order=sort_order,
        ),
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=RiskListResponse,
        query=collection_query,
        plan=listing_plan,
    )
