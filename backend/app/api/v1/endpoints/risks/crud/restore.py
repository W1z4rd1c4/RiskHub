from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_risk_read
from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.risk import RiskRead, RiskStatusEnum
from app.services.authorization_capabilities import risk_capabilities

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

    if risk.status != RiskStatusEnum.archived.value:
        raise HTTPException(status_code=400, detail="Risk is not archived")

    changes = build_change_set(risk, {"status": RiskStatusEnum.active.value})
    risk.status = RiskStatusEnum.active.value

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=f"{risk.risk_id_code}",
        safe_entity_label=risk.risk_id_code,
        safe_description="Restored risk",
        safe_description_siem="Restored risk",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=risk.department_id,
        changes=changes,
        description=f"Restored risk {risk.risk_id_code}",
    )
    await db.commit()
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
