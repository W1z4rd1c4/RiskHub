from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.core.activity_logger import log_activity
from app.core.datetime_utils import utc_now
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import can_read_vendor, check_department_access
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.kri import KRICreate, KRIResponse
from app.schemas.vendor_shared import LinkedVendorRead
from app.services.kri_vendor_assignment import (
    assign_vendors_to_kri,
    validate_assignable_vendors,
)

from .list import router


@router.post("", response_model=KRIResponse, status_code=201)
async def create_kri(
    data: KRICreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new KRI. Requires risks:write permission."""
    linked_vendor_ids = data.linked_vendor_ids
    ensure_parent_risk_vendor_ids = data.ensure_parent_risk_vendor_ids

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
    await validate_active_owner_reference(
        db,
        user_id=data.reporting_owner_id,
        label="Reporting owner",
    )

    await validate_assignable_vendors(
        db,
        current_user=current_user,
        vendor_ids=[*linked_vendor_ids, *ensure_parent_risk_vendor_ids],
    )

    try:
        kri = KeyRiskIndicator(**data.model_dump(exclude={"linked_vendor_ids", "ensure_parent_risk_vendor_ids"}))
        db.add(kri)
        await db.flush()

        await assign_vendors_to_kri(
            db,
            kri=kri,
            linked_vendor_ids=linked_vendor_ids,
            ensure_parent_risk_vendor_ids=ensure_parent_risk_vendor_ids,
        )

        # Log activity within the same transaction
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            safe_entity_label=kri.metric_name,
            action=ActivityAction.CREATE,
            actor=current_user,
            department_id=risk.department_id,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
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
