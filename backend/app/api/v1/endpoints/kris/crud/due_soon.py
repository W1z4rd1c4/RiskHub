from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User

from ..access import apply_kri_department_scope

router = APIRouter()


@router.get("/due-soon", response_model=list[dict])
async def list_due_soon_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: int | None = Query(None, description="Filter by specific department"),
):
    """
    List all KRIs that are due soon (within 7 days before period end).

    Returns KRIs with due_date, days_until_due, and reporting_owner info.
    Useful for CRO dashboard to see upcoming deadlines.
    """
    from app.services.kri_history_service import KRIHistoryService

    due_soon = await KRIHistoryService.get_due_soon_kris(db)
    return await apply_kri_department_scope(due_soon, current_user=current_user, department_id=department_id)
