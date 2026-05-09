import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limits import DASHBOARD_TREND_MONTHS
from app.core.permissions import risk_visibility_clause
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Department, Risk, User
from app.schemas.dashboard import RiskDistributionItem, RiskDistributionResponse, RiskTrendPoint
from app.services._dashboard_metrics.risk_levels import (
    build_risk_level_condition_from_ranges,
    get_configured_risk_level_ranges,
)

from ._shared import month_period_expr

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/risk-distribution", response_model=RiskDistributionResponse)
async def get_risk_distribution(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    risk_level: Optional[Literal["critical", "high", "medium", "low"]] = Query(
        None, description="Filter by risk level"
    ),
    risk_type: Literal["gross", "net"] = Query("net", description="Type of risk matrix: 'gross' or 'net'"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get risk distribution for 5x5 risk matrix visualization with optional filters.

    Args:
        risk_type: 'gross' uses gross_probability/gross_impact; 'net' uses net_probability/net_impact
    """
    # Build conditions
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

    # Select probability/impact columns based on risk_type
    if risk_type == "gross":
        prob_col = Risk.gross_probability
        impact_col = Risk.gross_impact
    else:
        prob_col = Risk.net_probability
        impact_col = Risk.net_impact

    # Group risks by selected probability and impact
    distribution_query = select(
        prob_col.label("probability"), impact_col.label("impact"), func.count(Risk.id).label("item_count")
    )

    if conditions:
        distribution_query = distribution_query.where(and_(*conditions))

    distribution_query = distribution_query.group_by(prob_col, impact_col)

    result = await db.execute(distribution_query)
    rows = result.all()

    distribution = [
        RiskDistributionItem(probability=row.probability, impact=row.impact, count=row.item_count)
        for row in rows
        if row.probability and row.impact
    ]

    return RiskDistributionResponse(distribution=distribution)


@router.get("/risks-by-cell", response_model=list[dict])
async def get_risks_by_cell(
    probability: int = Query(..., ge=1, le=5, description="Probability value (1-5)"),
    impact: int = Query(..., ge=1, le=5, description="Impact value (1-5)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    risk_type: Literal["gross", "net"] = Query("net", description="Type of risk matrix: 'gross' or 'net'"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get list of risks at a specific probability/impact intersection for drill-down.

    Args:
        risk_type: 'gross' uses gross_probability/gross_impact; 'net' uses net_probability/net_impact
    """

    # Select probability/impact columns based on risk_type
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

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": row.id,
            "risk_id_code": row.risk_id_code,
            "name": row.risk_name or row.risk_id_code,  # Risk name, fallback to code
            "description": row.description[:150] + "..."
            if row.description and len(row.description) > 150
            else (row.description or ""),
            "net_score": row.score,  # Keep key as net_score for backwards compatibility
            "department_name": row.department_name or "Unassigned",
            "owner_name": row.owner_name or "Unassigned",
        }
        for row in rows
    ]


@router.get("/risk-trends", response_model=list[RiskTrendPoint])
async def get_risk_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get risk creation trends by month (last 12 months)."""
    try:
        # Build conditions
        conditions = []
        if not include_archived:
            conditions.append(Risk.live())
        visibility_clause = await risk_visibility_clause(db, current_user, department_id=department_id)
        if visibility_clause is not None:
            conditions.append(visibility_clause)

        # Query risk counts grouped by month
        period_expr = month_period_expr(db, Risk.created_at)
        critical_threshold = (await get_configured_risk_level_ranges(db))["critical"][0]
        query = select(
            period_expr.label("period"),
            func.count(Risk.id).label("total_new"),
            func.sum(case((Risk.net_score >= critical_threshold, 1), else_=0)).label("critical_new"),
        )

        if conditions:
            query = query.where(and_(*conditions))

        query = query.group_by(period_expr).order_by(desc(period_expr)).limit(DASHBOARD_TREND_MONTHS)

        result = await db.execute(query)
        rows = result.all()

        # Reverse to show oldest first
        trends = [
            RiskTrendPoint(period=row.period, total_new=row.total_new or 0, critical_new=int(row.critical_new or 0))
            for row in rows
            if row.period
        ]
        return list(reversed(trends))
    except Exception as e:
        logger.exception("Error fetching risk trends: %s", str(e))
        return []
