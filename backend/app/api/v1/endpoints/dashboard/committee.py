from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models import User
from app.services._dashboard_metrics import build_committee_summary_metrics

router = APIRouter()


@router.get("/committee-summary")
async def get_committee_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
):
    """
    Get executive summary for Risk Committee meetings.

    Returns high-level overview with key decision points.
    """
    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    return await build_committee_summary_metrics(db=db, current_user=current_user)
