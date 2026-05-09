from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.audit.kri import kri_restored
from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.schemas.kri import KRIResponse
from app.services._kri_history.direct_application import visible_linked_vendors
from app.services._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.services.authorization_capabilities import kri_capabilities
from app.services.transaction_boundary import commit_service_transaction

router = APIRouter()


@router.post("/{kri_id}/restore", response_model=KRIResponse)
async def restore_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """Restore an archived KRI."""
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    check_department_access(kri.risk.department_id, current_user)

    if not kri.is_archived:
        raise HTTPException(status_code=400, detail="KRI is not archived")

    before_data = {
        "is_archived": kri.is_archived,
        "archived_at": kri.archived_at,
        "archived_by_id": kri.archived_by_id,
    }
    kri.mark_restored(current_user)
    after_data = {
        "is_archived": kri.is_archived,
        "archived_at": kri.archived_at,
        "archived_by_id": kri.archived_by_id,
    }

    await kri_restored(db, actor=current_user, kri=kri, before_data=before_data, after_data=after_data)
    await commit_service_transaction(db)
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
    capabilities = await kri_capabilities(db, current_user=current_user, kri=reloaded_kri)
    return serialize_kri_response(
        reloaded_kri,
        monitoring_context,
        linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", [])),
        capabilities=capabilities,
    )
