from __future__ import annotations

from datetime import timedelta

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import ActivityLog, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.activity_log import ActivityLogListResponse

from .criteria import ActivityLogQueryCriteria
from .policy import activity_log_department_scope
from .projection import build_activity_log_response, build_empty_activity_log_response


async def list_activity_log_entries(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: ActivityLogQueryCriteria,
) -> ActivityLogListResponse:
    query = select(ActivityLog)
    dept_ids = activity_log_department_scope(current_user)
    if dept_ids is not None:
        if not dept_ids:
            return build_empty_activity_log_response(skip=criteria.skip, limit=criteria.limit, current_user=current_user)
        query = query.where(ActivityLog.department_id.in_(dept_ids))

    if criteria.entity_type:
        query = query.where(ActivityLog.entity_type.in_(criteria.entity_type))
    if criteria.entity_id:
        query = query.where(ActivityLog.entity_id == criteria.entity_id)
    if criteria.actor_id:
        query = query.where(ActivityLog.actor_id == criteria.actor_id)
    if criteria.department_id:
        query = query.where(ActivityLog.department_id == criteria.department_id)
    if criteria.action:
        query = query.where(ActivityLog.action == criteria.action)

    date_from = criteria.date_from
    date_to = criteria.date_to
    if criteria.search:
        if not date_from and not date_to:
            date_from = utc_now() - timedelta(days=90)
        pattern = f"%{criteria.search}%"
        query = query.where(
            or_(
                ActivityLog.description.ilike(pattern),
                ActivityLog.entity_name.ilike(pattern),
                ActivityLog.actor_name.ilike(pattern),
                cast(ActivityLog.changes, String).ilike(pattern),
            )
        )
    if date_from:
        query = query.where(ActivityLog.created_at >= date_from)
    if date_to:
        query = query.where(ActivityLog.created_at <= date_to)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    result = await db.execute(query.order_by(ActivityLog.created_at.desc()).offset(criteria.skip).limit(criteria.limit))
    return build_activity_log_response(
        entries=list(result.scalars().all()),
        total=total,
        skip=criteria.skip,
        limit=criteria.limit,
        current_user=current_user,
    )


def list_activity_log_entity_types() -> list[str]:
    return [entity_type.value for entity_type in ActivityEntityType]


def list_activity_log_actions() -> list[str]:
    return [action.value for action in ActivityAction]
