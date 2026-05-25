from __future__ import annotations

import logging
from typing import Literal

from sqlalchemy import and_, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limits import DASHBOARD_TREND_MONTHS
from app.core.permissions import risk_visibility_clause
from app.models import Department, Risk, User
from app.schemas.dashboard import RiskDistributionItem, RiskDistributionResponse, RiskTrendPoint
from app.services._dashboard_metrics.periods import month_period_expr
from app.services._dashboard_metrics.risk_levels import (
    build_risk_level_condition_from_ranges,
    get_configured_risk_level_ranges,
)

logger = logging.getLogger(__name__)


async def load_risk_distribution(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
    risk_level: Literal["critical", "high", "medium", "low"] | None,
    risk_type: Literal["gross", "net"],
    include_archived: bool,
) -> RiskDistributionResponse:
    conditions = []
    if not include_archived:
        conditions.append(Risk.live())
    visibility_clause = await risk_visibility_clause(db, current_user, department_id=department_id)
    if visibility_clause is not None:
        conditions.append(visibility_clause)
    if risk_level:
        risk_level_ranges = await get_configured_risk_level_ranges(db)
        risk_level_cond = build_risk_level_condition_from_ranges(risk_level, risk_level_ranges)
        if risk_level_cond is not None:
            conditions.append(risk_level_cond)

    if risk_type == "gross":
        prob_col = Risk.gross_probability
        impact_col = Risk.gross_impact
    else:
        prob_col = Risk.net_probability
        impact_col = Risk.net_impact

    distribution_query = select(
        prob_col.label("probability"), impact_col.label("impact"), func.count(Risk.id).label("item_count")
    )

    if conditions:
        distribution_query = distribution_query.where(and_(*conditions))

    result = await db.execute(distribution_query.group_by(prob_col, impact_col))
    distribution = [
        RiskDistributionItem(probability=row.probability, impact=row.impact, count=row.item_count)
        for row in result.all()
        if row.probability and row.impact
    ]

    return RiskDistributionResponse(distribution=distribution)


async def load_risks_by_cell(
    *,
    db: AsyncSession,
    current_user: User,
    probability: int,
    impact: int,
    department_id: int | None,
    risk_type: Literal["gross", "net"],
    include_archived: bool,
) -> list[dict]:
    if risk_type == "gross":
        prob_col = Risk.gross_probability
        impact_col = Risk.gross_impact
        score_col = Risk.gross_score
    else:
        prob_col = Risk.net_probability
        impact_col = Risk.net_impact
        score_col = Risk.net_score

    conditions = [prob_col == probability, impact_col == impact]

    if not include_archived:
        conditions.append(Risk.live())

    visibility_clause = await risk_visibility_clause(db, current_user, department_id=department_id)
    if visibility_clause is not None:
        conditions.append(visibility_clause)

    query = (
        select(
            Risk.id,
            Risk.risk_id_code,
            Risk.name.label("risk_name"),
            Risk.description,
            score_col.label("score"),
            Department.name.label("department_name"),
            User.name.label("owner_name"),
        )
        .join(Department, Risk.department_id == Department.id, isouter=True)
        .join(User, Risk.owner_id == User.id, isouter=True)
        .where(and_(*conditions))
        .order_by(score_col.desc())
    )

    rows = (await db.execute(query)).all()
    return [
        {
            "id": row.id,
            "risk_id_code": row.risk_id_code,
            "name": row.risk_name or row.risk_id_code,
            "description": row.description[:150] + "..."
            if row.description and len(row.description) > 150
            else (row.description or ""),
            "net_score": row.score,
            "department_name": row.department_name or "Unassigned",
            "owner_name": row.owner_name or "Unassigned",
        }
        for row in rows
    ]


async def load_risk_trends(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
    include_archived: bool,
) -> list[RiskTrendPoint]:
    try:
        conditions = []
        if not include_archived:
            conditions.append(Risk.live())
        visibility_clause = await risk_visibility_clause(db, current_user, department_id=department_id)
        if visibility_clause is not None:
            conditions.append(visibility_clause)

        period_expr = month_period_expr(db, Risk.created_at)
        critical_threshold = (await get_configured_risk_level_ranges(db))["critical"][0]
        query = select(
            period_expr.label("period"),
            func.count(Risk.id).label("total_new"),
            func.sum(case((Risk.net_score >= critical_threshold, 1), else_=0)).label("critical_new"),
        )

        if conditions:
            query = query.where(and_(*conditions))

        rows = (
            await db.execute(
                query.group_by(period_expr).order_by(desc(period_expr)).limit(DASHBOARD_TREND_MONTHS)
            )
        ).all()
        trends = [
            RiskTrendPoint(period=row.period, total_new=row.total_new or 0, critical_new=int(row.critical_new or 0))
            for row in rows
            if row.period
        ]
        return list(reversed(trends))
    except Exception as exc:
        logger.exception("Error fetching risk trends: %s", str(exc))
        return []


async def load_risk_dashboard_metrics(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
    risk_level: Literal["critical", "high", "medium", "low"] | None,
    include_archived: bool,
) -> dict[str, object]:
    return {
        "gross_distribution": await load_risk_distribution(
            db=db,
            current_user=current_user,
            department_id=department_id,
            risk_level=risk_level,
            risk_type="gross",
            include_archived=include_archived,
        ),
        "net_distribution": await load_risk_distribution(
            db=db,
            current_user=current_user,
            department_id=department_id,
            risk_level=risk_level,
            risk_type="net",
            include_archived=include_archived,
        ),
        "risk_trends": await load_risk_trends(
            db=db,
            current_user=current_user,
            department_id=department_id,
            include_archived=include_archived,
        ),
    }
