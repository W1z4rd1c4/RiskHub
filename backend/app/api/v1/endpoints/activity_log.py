"""Activity Log API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import UtcAwareDatetime
from app.core.security import require_business_permission
from app.db.session import get_db
from app.models import User
from app.schemas.activity_log import ActivityLogListResponse
from app.services._activity_log_query.criteria import build_activity_log_query_criteria
from app.services._activity_log_query.query import (
    list_activity_log_actions,
    list_activity_log_entity_types,
    list_activity_log_entries,
)

router = APIRouter()


@router.get("", response_model=ActivityLogListResponse)
async def list_activity_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_business_permission(
            "activity_log",
            "read",
            detail="Platform admins cannot access the business Activity Log",
        )
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    # Filters
    entity_type: Optional[list[str]] = Query(None, description="Filter by entity type (supports multiple)"),
    entity_id: Optional[int] = Query(None, description="Filter by specific entity"),
    actor_id: Optional[int] = Query(None, description="Filter by actor (user)"),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    search: Optional[str] = Query(
        None, description="Fulltext search in sanitized entity labels, actor names, and change payloads"
    ),
    date_from: UtcAwareDatetime | None = Query(None, description="Start date"),
    date_to: UtcAwareDatetime | None = Query(None, description="End date"),
):
    """
    List activity log entries with filters.

    Access control:
    - Privileged users see all entries
    - Department heads see only their department's entries

    Note: `search` defaults to the last 90 days unless an explicit date range is provided.
    """
    criteria = build_activity_log_query_criteria(
        skip=skip,
        limit=limit,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
        department_id=department_id,
        action=action,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )
    return await list_activity_log_entries(db=db, current_user=current_user, criteria=criteria)


@router.get("/entity-types", response_model=list[str])
async def get_entity_types(
    current_user: User = Depends(
        require_business_permission(
            "activity_log",
            "read",
            detail="Platform admins cannot access the business Activity Log",
        )
    ),
):
    """Get list of all entity types for filter dropdown."""
    return list_activity_log_entity_types()


@router.get("/actions", response_model=list[str])
async def get_actions(
    current_user: User = Depends(
        require_business_permission(
            "activity_log",
            "read",
            detail="Platform admins cannot access the business Activity Log",
        )
    ),
):
    """Get list of all action types for filter dropdown."""
    return list_activity_log_actions()
