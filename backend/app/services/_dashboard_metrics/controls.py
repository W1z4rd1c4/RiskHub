from __future__ import annotations

import logging

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.limits import DASHBOARD_CONTROL_TREND_WEEKS
from app.core.permissions import control_visibility_clause
from app.models import Control, ControlExecution, User
from app.schemas.dashboard import ControlFrequencyTrend
from app.services._dashboard_metrics.periods import week_period_expr

logger = logging.getLogger(__name__)


async def load_control_trends(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None = None,
    control_status: str | None = None,
) -> list[ControlFrequencyTrend]:
    try:
        conditions: list[ColumnElement[bool]] = [ControlExecution.executed_at.isnot(None)]
        control_conditions: list[ColumnElement[bool]] = [Control.live()]
        visibility_clause = control_visibility_clause(current_user, department_id=department_id)
        if visibility_clause is not None:
            control_conditions.append(visibility_clause)
        if control_status:
            control_conditions.append(Control.status == control_status)
        conditions.append(ControlExecution.control_id.in_(select(Control.id).where(and_(*control_conditions))))

        period_expr = week_period_expr(db, ControlExecution.executed_at)
        trends_query = (
            select(period_expr.label("period"), func.count(ControlExecution.id).label("execution_count"))
            .where(and_(*conditions))
            .group_by(period_expr)
            .order_by(desc(period_expr))
            .limit(DASHBOARD_CONTROL_TREND_WEEKS)
        )

        rows = (await db.execute(trends_query)).all()
        trends = [
            ControlFrequencyTrend(period=row.period, execution_count=row.execution_count) for row in rows if row.period
        ]
        return list(reversed(trends))
    except Exception as exc:
        logger.exception("Error fetching control trends: %s", str(exc))
        return []


async def load_control_dashboard_metrics(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
    control_status: str | None,
) -> dict[str, object]:
    return {
        "control_trends": await load_control_trends(
            db=db,
            current_user=current_user,
            department_id=department_id,
            control_status=control_status,
        )
    }
