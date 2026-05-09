from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.schemas.kri import KRIResponse
from app.services._kri_history.direct_application import visible_linked_vendors
from app.services._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.services._monitoring_status import KRIMonitoringStatus

from ..access import apply_kri_department_scope

router = APIRouter()


@router.get("/breaches", response_model=list[KRIResponse])
async def list_breaches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: int | None = Query(None, description="Filter by department ID"),
    include_archived: bool = Query(False, description="Include archived KRIs/risks"),
):
    """List only breached KRIs for dashboard widget. Excludes archived risks AND archived KRIs by default."""
    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)

    # Exclude archived risks AND archived KRIs by default
    if not include_archived:
        query = query.where(
            Risk.live(),
            KeyRiskIndicator.is_archived.is_(False),
        )

    query = await apply_kri_department_scope(query, db=db, current_user=current_user, department_id=department_id)

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.owner),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.department),
        selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
    )
    result = await db.execute(query)
    kris = result.scalars().all()

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    items = [
        serialize_kri_response(
            kri,
            monitoring_context,
            linked_vendors=visible_linked_vendors(current_user, getattr(kri, "vendor_links", [])),
        )
        for kri in kris
    ]
    breaches = [item for item in items if item.monitoring_status == KRIMonitoringStatus.breach]

    return breaches
