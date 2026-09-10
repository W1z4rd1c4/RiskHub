from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import risk_visibility_clause
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Risk, User

router = APIRouter()


@router.get("/risk-filters")
async def get_risk_filters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """Get live, readable Risk form suggestions in one bounded query."""
    query = select(Risk.process, Risk.subprocess, Risk.category).where(Risk.live()).distinct()
    visibility = await risk_visibility_clause(db, current_user)
    if visibility is not None:
        query = query.where(visibility)

    rows = (await db.execute(query)).all()
    processes = sorted({row.process for row in rows if row.process})
    categories = sorted({row.category for row in rows if row.category})
    subprocesses_by_process = {
        process: sorted({row.subprocess for row in rows if row.process == process and row.subprocess})
        for process in processes
        if any(row.process == process and row.subprocess for row in rows)
    }

    return {
        "processes": processes,
        "categories": categories,
        "subprocesses_by_process": subprocesses_by_process,
    }
