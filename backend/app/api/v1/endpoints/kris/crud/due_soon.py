from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User

router = APIRouter()


@router.get("/due-soon", response_model=list[dict])
async def list_due_soon_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by specific department"),
):
    """
    List all KRIs that are due soon (within 7 days before period end).

    Returns KRIs with due_date, days_until_due, and reporting_owner info.
    Useful for CRO dashboard to see upcoming deadlines.
    """
    from app.services.kri_history_service import KRIHistoryService

    due_soon = await KRIHistoryService.get_due_soon_kris(db)

    # Compute user's allowed departments FIRST (RBAC)
    dept_ids = get_user_department_ids(current_user)

    # Validate department_id filter against user's access scope
    if department_id is not None:
        # Privileged users (dept_ids=None) can filter any department
        if dept_ids is None:
            filtered = [item for item in due_soon if item.get("department_id") == department_id]
            return filtered
        # Non-privileged: only allow filtering within their own departments
        if department_id not in dept_ids:
            # Return empty to avoid leaking department existence (match existing patterns)
            return []
        filtered = [item for item in due_soon if item.get("department_id") == department_id]
        return filtered

    # No explicit filter: apply department scoping
    if dept_ids is not None:
        filtered = [item for item in due_soon if item.get("department_id") in dept_ids]
        return filtered

    return due_soon
