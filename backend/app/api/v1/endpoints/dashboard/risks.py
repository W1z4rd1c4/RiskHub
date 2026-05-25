from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.schemas.dashboard import RiskDistributionResponse, RiskTrendPoint
from app.services._dashboard_metrics.risks import load_risk_distribution, load_risk_trends, load_risks_by_cell

router = APIRouter()


@router.get("/risk-distribution", response_model=RiskDistributionResponse)
async def get_risk_distribution(
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    risk_level: Optional[Literal["critical", "high", "medium", "low"]] = Query(
        None, description="Filter by risk level"
    ),
    risk_type: Literal["gross", "net"] = Query("net", description="Type of risk matrix: 'gross' or 'net'"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get risk distribution for 5x5 risk matrix visualization with optional filters."""
    return await load_risk_distribution(
        db=db,
        current_user=current_user,
        department_id=department_id,
        risk_level=risk_level,
        risk_type=risk_type,
        include_archived=include_archived,
    )


@router.get("/risks-by-cell", response_model=list[dict])
async def get_risks_by_cell(
    probability: int = Query(..., ge=1, le=5, description="Probability value (1-5)"),
    impact: int = Query(..., ge=1, le=5, description="Impact value (1-5)"),
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    risk_type: Literal["gross", "net"] = Query("net", description="Type of risk matrix: 'gross' or 'net'"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get list of risks at a specific probability/impact intersection for drill-down."""
    return await load_risks_by_cell(
        db=db,
        current_user=current_user,
        probability=probability,
        impact=impact,
        department_id=department_id,
        risk_type=risk_type,
        include_archived=include_archived,
    )


@router.get("/risk-trends", response_model=list[RiskTrendPoint])
async def get_risk_trends(
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get risk creation trends by month (last 12 months)."""
    return await load_risk_trends(
        db=db,
        current_user=current_user,
        department_id=department_id,
        include_archived=include_archived,
    )
