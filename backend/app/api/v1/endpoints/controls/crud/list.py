from typing import Optional

from fastapi import APIRouter, Depends, Query
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
from app.services._register_listings.lifecycle import execute_register_listing_plan

router = APIRouter()

@router.get("", response_model=ControlListResponse)
async def list_controls(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[str] = None,
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
            "search": search,
            "process": process,
            "category": category,
            "monitoring_status": monitoring_status,
        },
    )
    collection_query = collection_context.query
    listing_plan = await build_control_listing_plan(
        db=db,
        current_user=current_user,
        criteria=ControlListingCriteria(query=collection_query, filters=collection_context.filters),
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=ControlListResponse,
        query=collection_query,
        plan=listing_plan,
    )
