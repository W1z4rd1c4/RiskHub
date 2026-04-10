import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limits import DASHBOARD_CONTROL_TREND_WEEKS
from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, User
from app.schemas.dashboard import ControlFrequencyTrend

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/control-trends", response_model=list[ControlFrequencyTrend])
async def get_control_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    response: Response = None,
    department_id: Optional[int] = Query(None, description="Filter by department"),
    control_status: Optional[str] = Query(None, description="Filter by control status"),
):
    """Get control execution trends by week (last 8 weeks) with optional filters."""

    try:
        dept_ids = get_user_department_ids(current_user)

        # Early return for users with no department access
        if dept_ids is not None and len(dept_ids) == 0:
            return []  # User has no department access - return empty results

        # Build base conditions
        conditions = [ControlExecution.executed_at.isnot(None)]

        # For department filtering, we need to join with Control
        if dept_ids is not None or department_id or control_status:
            # Build subquery for control IDs matching filters
            control_conditions = []
            if dept_ids is not None:
                control_conditions.append(Control.department_id.in_(dept_ids))
            elif department_id:
                control_conditions.append(Control.department_id == department_id)
            if control_status:
                control_conditions.append(Control.status == control_status)

            control_ids_query = select(Control.id).where(and_(*control_conditions))
            conditions.append(ControlExecution.control_id.in_(control_ids_query))

        # Check if there are any executions matching conditions
        count_query = select(func.count(ControlExecution.id))
        if len(conditions) > 1:
            count_query = count_query.where(and_(*conditions))
        else:
            count_query = count_query.where(conditions[0])
        count_result = await db.execute(count_query)
        total_count = count_result.scalar() or 0

        if total_count == 0:
            return []

        # Define period expression once to avoid GROUP BY mismatch
        period_expr = func.to_char(ControlExecution.executed_at, 'IYYY-"W"IW')

        # Query control executions grouped by ISO week
        trends_query = select(period_expr.label("period"), func.count(ControlExecution.id).label("execution_count"))

        if len(conditions) > 1:
            trends_query = trends_query.where(and_(*conditions))
        else:
            trends_query = trends_query.where(conditions[0])

        # Group and order by the period expression
        trends_query = (
            trends_query.group_by(period_expr).order_by(desc(period_expr)).limit(DASHBOARD_CONTROL_TREND_WEEKS)
        )

        result = await db.execute(trends_query)
        rows = result.all()

        trends = [
            ControlFrequencyTrend(period=row.period, execution_count=row.execution_count) for row in rows if row.period
        ]

        # Reverse to show oldest first for charts
        return list(reversed(trends))
    except Exception as e:
        # Log the error for observability
        logger.exception("Error fetching control trends: %s", str(e))
        # Signal error via response header if response object available
        if response is not None:
            response.headers["X-Control-Trends-Error"] = "1"
        return []
