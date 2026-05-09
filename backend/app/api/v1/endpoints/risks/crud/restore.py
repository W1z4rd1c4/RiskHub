from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit.risk import risk_restored
from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.risk import RiskRead
from app.services._monitoring_response import load_monitoring_response_context, serialize_risk_read
from app.services.authorization_capabilities import risk_capabilities
from app.services.transaction_boundary import commit_service_transaction

router = APIRouter()


@router.post("/{risk_id}/restore", response_model=RiskRead)
async def restore_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """Restore an archived risk back to active status."""
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        )
        .where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()

    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    # Mirror delete semantics: risk owners can restore cross-department
    is_owner = risk.owner_id == current_user.id
    if not is_owner:
        check_department_access(risk.department_id, current_user)

    if not risk.is_archived:
        raise HTTPException(status_code=400, detail="Risk is not archived")

    before_data = {
        "is_archived": risk.is_archived,
        "archived_at": risk.archived_at,
        "archived_by_id": risk.archived_by_id,
    }
    risk.mark_restored(current_user)
    after_data = {
        "is_archived": risk.is_archived,
        "archived_at": risk.archived_at,
        "archived_by_id": risk.archived_by_id,
    }

    await risk_restored(db, actor=current_user, risk=risk, before_data=before_data, after_data=after_data)
    await commit_service_transaction(db)
    await db.refresh(risk)

    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        )
        .where(Risk.id == risk.id)
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    reloaded_risk = result.scalar_one()
    capabilities = await risk_capabilities(db, current_user=current_user, risk=reloaded_risk)
    return serialize_risk_read(reloaded_risk, monitoring_context, capabilities=capabilities)
