from __future__ import annotations

import logging

from sqlalchemy import and_, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limits import DASHBOARD_TREND_MONTHS
from app.core.permissions import kri_visibility_clause
from app.models import KeyRiskIndicator, Risk, User
from app.models.kri_history import KRIValueHistory
from app.schemas.dashboard import KRIBreachTrendPoint
from app.services._dashboard_metrics.periods import month_period_expr

logger = logging.getLogger(__name__)


async def load_kri_breach_trends(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
) -> list[KRIBreachTrendPoint]:
    try:
        conditions = [
            KRIValueHistory.period_end.isnot(None),
            Risk.live(),
            KeyRiskIndicator.is_archived.is_(False),
        ]
        visibility_clause = await kri_visibility_clause(db, current_user, department_id=department_id)
        if visibility_clause is not None:
            conditions.append(visibility_clause)

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

        rows = (await db.execute(query)).all()
        trends = [
            KRIBreachTrendPoint(
                period=row.period,
                total_entries=row.total_entries or 0,
                breached_entries=int(row.breached_entries or 0),
            )
            for row in rows
            if row.period
        ]
        return list(reversed(trends))
    except Exception as exc:
        logger.exception("Error fetching KRI breach trends: %s", str(exc))
        return []


async def load_kri_dashboard_metrics(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
) -> dict[str, object]:
    return {
        "kri_breach_trends": await load_kri_breach_trends(
            db=db,
            current_user=current_user,
            department_id=department_id,
        )
    }
