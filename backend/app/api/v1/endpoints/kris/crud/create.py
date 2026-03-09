from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.core.datetime_utils import utc_now
from app.core.activity_logger import log_activity
from app.core.permissions import can_read_vendor, check_department_access
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.kri import KRICreate, KRIResponse
from app.schemas.vendor_shared import LinkedVendorRead

from .list import router


@router.post("", response_model=KRIResponse, status_code=201)
async def create_kri(
    data: KRICreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new KRI. Requires risks:write permission."""
    # Verify risk exists
    risk_result = await db.execute(select(Risk).where(Risk.id == data.risk_id))
    risk = risk_result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    # Verify department access
    check_department_access(risk.department_id, current_user)

    # Validate limits
    if data.lower_limit >= data.upper_limit:
        raise HTTPException(status_code=400, detail="lower_limit must be less than upper_limit")

    kri = KeyRiskIndicator(**data.model_dump())
    db.add(kri)
    await db.flush()

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=f"{kri.metric_name}",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=risk.department_id,
    )
    await db.commit()
    await db.refresh(kri)

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri.id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    reloaded_kri = result.scalar_one()

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_kri_response(
        reloaded_kri,
        monitoring_context,
        linked_vendors=[
            LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
            for link in getattr(reloaded_kri, "vendor_links", []) or []
            if getattr(link, "vendor", None) is not None
            and check_permission(current_user, "vendors", "read")
            and can_read_vendor(link.vendor, current_user)
        ],
    )
