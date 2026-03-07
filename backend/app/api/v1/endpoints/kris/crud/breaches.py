from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.core.datetime_utils import utc_now
from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import KRIResponse
from app.services._monitoring_status import KRIMonitoringStatus

router = APIRouter()


@router.get("/breaches", response_model=list[KRIResponse])
async def list_breaches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department ID"),
    include_archived: bool = Query(False, description="Include archived KRIs/risks"),
):
    """List only breached KRIs for dashboard widget. Excludes archived risks AND archived KRIs by default."""
    from app.models.risk import RiskStatus

    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)

    # Exclude archived risks AND archived KRIs by default
    if not include_archived:
        query = query.where(
            Risk.status != RiskStatus.archived.value,
            KeyRiskIndicator.is_archived.is_(False),
        )

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        query = query.filter(Risk.department_id.in_(dept_ids))

    # Apply explicit department filter if provided (and allowed)
    if department_id:
        if dept_ids is not None and department_id not in dept_ids:
            # User trying to access unauthorized department
            # Just return empty, or could raise 403. Returning empty is safer for filters.
            return []
        query = query.filter(Risk.department_id == department_id)

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.owner),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.department),
    )
    result = await db.execute(query)
    kris = result.scalars().all()

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    items = [serialize_kri_response(kri, monitoring_context) for kri in kris]
    breaches = [item for item in items if item.monitoring_status == KRIMonitoringStatus.breach]

    return breaches
