from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import Risk, User
from app.models.risk import RiskStatus
from app.core.permissions import get_user_department_ids
from app.core.security import require_permission

router = APIRouter()


@router.get("/risk-filters")
async def get_risk_filters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """Get unique values for risk filters (processes, categories).
    
    For privileged users, returns global values.
    For department-scoped users, returns only values from their departments.
    Excludes archived risks from lookups.
    """
    # Get user's department scope
    dept_ids = get_user_department_ids(current_user)
    
    # Build base query with archived filter
    base_conditions = [Risk.status != RiskStatus.archived.value]
    
    # Add department scoping for non-privileged users
    if dept_ids is not None:
        base_conditions.append(Risk.department_id.in_(dept_ids))
    
    # Unique processes
    process_query = select(Risk.process).distinct()
    for cond in base_conditions:
        process_query = process_query.where(cond)
    process_result = await db.execute(process_query)
    processes = [r[0] for r in process_result.all() if r[0]]
    
    # Unique categories
    category_query = select(Risk.category).distinct()
    for cond in base_conditions:
        category_query = category_query.where(cond)
    category_result = await db.execute(category_query)
    categories = [r[0] for r in category_result.all() if r[0]]
    
    return {
        "processes": sorted(processes),
        "categories": sorted(categories)
    }
