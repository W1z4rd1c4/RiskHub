from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User

router = APIRouter()


@router.get("/overdue", response_model=list[dict])
async def list_overdue_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by specific department"),
):
    """
    List all KRIs that are overdue for reporting.

    Returns KRIs with due_date, days_overdue, and reporting_owner info.
    """
    from app.services.kri_history_service import KRIHistoryService

    overdue = await KRIHistoryService.get_overdue_kris(db)

    # Compute user's allowed departments FIRST (RBAC)
    dept_ids = get_user_department_ids(current_user)

    # Validate department_id filter against user's access scope
    if department_id is not None:
        # Privileged users (dept_ids=None) can filter any department
        if dept_ids is None:
            filtered = [item for item in overdue if item.get("department_id") == department_id]
            return filtered
        # Non-privileged: only allow filtering within their own departments
        if department_id not in dept_ids:
            # Return empty to avoid leaking department existence (match existing patterns)
            return []
        filtered = [item for item in overdue if item.get("department_id") == department_id]
        return filtered

    # No explicit filter: apply department scoping
    if dept_ids is not None:
        filtered = [item for item in overdue if item.get("department_id") in dept_ids]
        return filtered

    return overdue
