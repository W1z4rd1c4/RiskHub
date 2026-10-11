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
from app.services.kri_populations import kri_breach_condition, live_clause, visible_query

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
    query = select(KeyRiskIndicator).join(Risk).where(kri_breach_condition())

    # Exclude archived risks AND archived KRIs by default
    if not include_archived:
        query = query.where(
            live_clause(),
        )

    query = await visible_query(query, db=db, actor=current_user, department_id=department_id)

    query = query.order_by(
        Risk.is_priority.desc(),
        Risk.net_score.desc().nulls_last(),
        KeyRiskIndicator.last_period_end.desc().nulls_last(),
        KeyRiskIndicator.last_reported_at.desc().nulls_last(),
        Risk.risk_id_code.asc(),
        KeyRiskIndicator.id.asc(),
    )

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
    return items
