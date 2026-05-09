from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User

from ..access import apply_kri_department_scope

router = APIRouter()


@router.get("/overdue", response_model=list[dict])
async def list_overdue_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: int | None = Query(None, description="Filter by specific department"),
):
    """
    List all KRIs that are overdue for reporting.

    Returns KRIs with due_date, days_overdue, and reporting_owner info.
    """
    from app.services.kri_history_service import KRIHistoryService

    overdue = await KRIHistoryService.get_overdue_kris(db)
    return await apply_kri_department_scope(overdue, current_user=current_user, department_id=department_id)
