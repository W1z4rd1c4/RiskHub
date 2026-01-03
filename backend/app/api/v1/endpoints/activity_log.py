"""Activity Log API endpoints."""
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User, ActivityLog
from app.models.activity_log import ActivityEntityType, ActivityAction
from app.schemas.activity_log import ActivityLogRead, ActivityLogListResponse
from app.api import deps
from app.core.security import require_permission
from app.core.permissions import get_user_department_ids

router = APIRouter()


@router.get("", response_model=ActivityLogListResponse)
async def list_activity_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("activity_log", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    # Filters
    entity_type: Optional[list[str]] = Query(None, description="Filter by entity type (supports multiple)"),
    entity_id: Optional[int] = Query(None, description="Filter by specific entity"),
    actor_id: Optional[int] = Query(None, description="Filter by actor (user)"),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    search: Optional[str] = Query(None, description="Fulltext search in description/entity_name"),
    date_from: Optional[datetime] = Query(None, description="Start date"),
    date_to: Optional[datetime] = Query(None, description="End date"),
):
    """
    List activity log entries with filters.
    
    Access control:
    - Privileged users see all entries
    - Department heads see only their department's entries
    """
    query = select(ActivityLog)
    
    # Access control: department scoping
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:  # Non-privileged user
        if not dept_ids:
            # User has no department access
            return ActivityLogListResponse(items=[], total=0, skip=skip, limit=limit)
        query = query.where(ActivityLog.department_id.in_(dept_ids))
    
    # Apply filters
    if entity_type:
        query = query.where(ActivityLog.entity_type.in_(entity_type))
    if entity_id:
        query = query.where(ActivityLog.entity_id == entity_id)
    if actor_id:
        query = query.where(ActivityLog.actor_id == actor_id)
    if department_id:
        # Additional department filter (privileged users can filter by any dept)
        query = query.where(ActivityLog.department_id == department_id)
    if action:
        query = query.where(ActivityLog.action == action)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                ActivityLog.description.ilike(pattern),
                ActivityLog.entity_name.ilike(pattern),
                ActivityLog.actor_name.ilike(pattern),
            )
        )
    if date_from:
        query = query.where(ActivityLog.created_at >= date_from)
    if date_to:
        query = query.where(ActivityLog.created_at <= date_to)
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Fetch entries with pagination (newest first)
    query = query.order_by(ActivityLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    entries = result.scalars().all()
    
    return ActivityLogListResponse(
        items=[ActivityLogRead.model_validate(e) for e in entries],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/entity-types", response_model=list[str])
async def get_entity_types(
    current_user: User = Depends(require_permission("activity_log", "read")),
):
    """Get list of all entity types for filter dropdown."""
    return [e.value for e in ActivityEntityType]


@router.get("/actions", response_model=list[str])
async def get_actions(
    current_user: User = Depends(require_permission("activity_log", "read")),
):
    """Get list of all action types for filter dropdown."""
    return [a.value for a in ActivityAction]
