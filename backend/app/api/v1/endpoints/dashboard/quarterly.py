import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.datetime_utils import utc_now
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models import Risk, User

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/quarterly-comparison")
async def get_quarterly_comparison(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
    current_quarter: Optional[str] = Query(None, description="Current quarter in format 'YYYY-QN' (e.g., '2026-Q1'). Defaults to current quarter."),
    compare_quarter: Optional[str] = Query(None, description="Comparison quarter in format 'YYYY-QN' (e.g., '2025-Q4'). Defaults to previous quarter."),
):
    """
    Get quarter-over-quarter comparison metrics for Risk Committee view.

    Returns:
        - this_quarter: metrics for current quarter
        - last_quarter: metrics for previous quarter
        - changes: percentage/absolute changes

    Optional query params:
        - current_quarter: Quarter to analyze (e.g., '2026-Q1')
        - compare_quarter: Quarter to compare against (e.g., '2025-Q4')
    """
    from app.services.quarterly_comparison_service import build_quarterly_comparison

    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    try:
        return await build_quarterly_comparison(
            db=db,
            current_user=current_user,
            current_quarter=current_quarter,
            compare_quarter=compare_quarter,
        )
    except ValueError as e:
        # Invalid quarter format
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error in quarterly-comparison endpoint: %s", str(e))
        raise


@router.get("/available-periods")
async def get_available_periods(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
):
    """
    Get available years and quarters for period selection.

    Returns:
        - years: List of unique years with data (from snapshots + entity creation dates)
        - current_quarter: Current quarter label (e.g., '2026-Q1')
    """
    from app.core.snapshot_service import get_quarter_label
    from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot

    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    now = utc_now()
    current_quarter_label = get_quarter_label(now)
    current_year = now.year

    # Get distinct years from quarterly snapshots
    snapshot_years_result = await db.execute(
        select(QuarterlyMetricSnapshot.year.distinct())
        .order_by(QuarterlyMetricSnapshot.year)
    )
    snapshot_years = set(row[0] for row in snapshot_years_result.fetchall())

    # Get distinct years from risk creation dates
    risk_years_result = await db.execute(
        select(func.extract('year', Risk.created_at).distinct())
        .where(Risk.created_at.isnot(None))
    )
    risk_years = set(int(row[0]) for row in risk_years_result.fetchall() if row[0])

    # Combine all years and include current year
    all_years = sorted(snapshot_years | risk_years | {current_year})

    return {
        "years": all_years,
        "current_quarter": current_quarter_label,
    }
