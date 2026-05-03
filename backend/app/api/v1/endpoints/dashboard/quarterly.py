import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models import User
from app.services._dashboard_metrics import build_available_periods
from app.services.quarterly_comparison_service import build_quarterly_comparison

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/quarterly-comparison")
async def get_quarterly_comparison(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
    current_quarter: Optional[str] = Query(
        None, description="Current quarter in format 'YYYY-QN' (e.g., '2026-Q1'). Defaults to current quarter."
    ),
    compare_quarter: Optional[str] = Query(
        None, description="Comparison quarter in format 'YYYY-QN' (e.g., '2025-Q4'). Defaults to previous quarter."
    ),
):
    """Get quarter-over-quarter comparison metrics for Risk Committee view."""
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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error in quarterly-comparison endpoint: %s", str(e))
        raise


@router.get("/available-periods")
async def get_available_periods(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
):
    """Get available years and quarters for period selection."""
    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    return await build_available_periods(db, current_user)
