from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.schemas.dashboard import DepartmentMetrics
from app.services._dashboard_metrics.departments import load_department_dashboard_metrics

router = APIRouter()


@router.get("/departments", response_model=list[DepartmentMetrics])
async def get_department_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter to specific department"),
    include_archived: bool = Query(False, description="Include archived items"),
):
    return await load_department_dashboard_metrics(
        db=db,
        current_user=current_user,
        department_id=department_id,
        include_archived=include_archived,
    )
