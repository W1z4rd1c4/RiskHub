"""
API endpoints for Key Risk Indicators.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.pagination import MAX_KRI_PAGE_SIZE
from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import KRIListResponse, KRIResponse

router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])


@router.get("", response_model=KRIListResponse)
async def list_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    risk_id: Optional[int] = Query(None, description="Filter by risk ID"),
    search: Optional[str] = Query(None, description="Search by metric name"),
    breach_only: bool = Query(False, description="Only return breached KRIs"),
    include_archived: bool = Query(False, description="Include archived KRIs"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=MAX_KRI_PAGE_SIZE),
):
    """List all KRIs with optional filters."""
    from app.core.permissions import get_kri_ids_where_reporting_owner

    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)

    # Exclude archived KRIs by default
    if not include_archived:
        query = query.where(KeyRiskIndicator.is_archived.is_(False))

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        # Include KRIs from user's departments OR where user is reporting owner
        reporting_owner_kri_ids = await get_kri_ids_where_reporting_owner(db, current_user.id)
        if reporting_owner_kri_ids:
            query = query.filter(
                or_(
                    Risk.department_id.in_(dept_ids),
                    KeyRiskIndicator.id.in_(reporting_owner_kri_ids),
                )
            )
        else:
            query = query.filter(Risk.department_id.in_(dept_ids))

    if risk_id:
        query = query.where(KeyRiskIndicator.risk_id == risk_id)

    if search:
        search_term = f"%{search.strip().lower()}%"
        query = query.where(func.lower(KeyRiskIndicator.metric_name).like(search_term))

    # Apply breach filter BEFORE count and pagination
    if breach_only:
        query = query.where(
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
            )
        )

    # Count total after all filters are applied
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Eagerly load risk, owner and department for grouping metadata
    query = query.options(
        selectinload(KeyRiskIndicator.risk).options(selectinload(Risk.owner), selectinload(Risk.department))
    )

    # Paginate
    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    kris = result.scalars().all()

    # Map to response with metadata
    items = []
    for k in kris:
        res = KRIResponse.model_validate(k)
        if k.risk:
            res.risk_category = k.risk.category
            res.risk_process = k.risk.process
            res.risk_description = k.risk.description
            res.risk_name = k.risk.name
            res.risk_type = k.risk.risk_type
            res.risk_id_code = k.risk.risk_id_code
            res.risk_owner_name = k.risk.owner.name if k.risk.owner else None
            res.risk_department_name = k.risk.department.name if k.risk.department else None
            if k.risk.department:
                res.department_name = k.risk.department.name
        items.append(res)

    return KRIListResponse(items=items, total=total, page=page, size=size)

