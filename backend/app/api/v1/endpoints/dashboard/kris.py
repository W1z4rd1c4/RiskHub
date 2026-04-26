import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limits import DASHBOARD_TREND_MONTHS
from app.core.permissions import kri_visibility_clause
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.models.kri_history import KRIValueHistory
from app.models.risk import RiskStatus
from app.schemas.dashboard import KRIBreachTrendPoint

from ._shared import month_period_expr

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/kri-breach-trends", response_model=list[KRIBreachTrendPoint])
async def get_kri_breach_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
):
    """Get KRI breach trends by month (last 12 months)."""
    try:
        # Build conditions: join KRIValueHistory -> KRI -> Risk; filter active/non-archived
        conditions = [
            KRIValueHistory.period_end.isnot(None),
            Risk.status != RiskStatus.archived.value,
            KeyRiskIndicator.is_archived.is_(False),
        ]
        visibility_clause = await kri_visibility_clause(db, current_user, department_id=department_id)
        if visibility_clause is not None:
            conditions.append(visibility_clause)

        # Query breach counts grouped by month
        period_expr = month_period_expr(db, KRIValueHistory.period_end)
        query = (
            select(
                period_expr.label("period"),
                func.count(KRIValueHistory.id).label("total_entries"),
                func.sum(case((KRIValueHistory.breach_status != "within", 1), else_=0)).label("breached_entries"),
            )
            .select_from(KRIValueHistory)
            .join(KeyRiskIndicator, KRIValueHistory.kri_id == KeyRiskIndicator.id)
            .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
            .where(and_(*conditions))
            .group_by(period_expr)
            .order_by(desc(period_expr))
            .limit(DASHBOARD_TREND_MONTHS)
        )

        result = await db.execute(query)
        rows = result.all()

        trends = [
            KRIBreachTrendPoint(
                period=row.period, total_entries=row.total_entries or 0, breached_entries=int(row.breached_entries or 0)
            )
            for row in rows
            if row.period
        ]
        return list(reversed(trends))
    except Exception as e:
        logger.exception("Error fetching KRI breach trends: %s", str(e))
        return []
