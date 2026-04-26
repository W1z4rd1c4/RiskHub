from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_risk_read
from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.risk import RiskRead
from app.services.authorization_capabilities import risk_capabilities

router = APIRouter()


@router.get("/{risk_id}", response_model=RiskRead)
async def get_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """Get a single risk with all relationships."""
    from app.core.permissions import is_risk_control_owner, is_risk_kri_reporting_owner

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

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())

    # Allow access if user is direct risk owner (cross-department ownership).
    if risk.owner_id == current_user.id:
        capabilities = await risk_capabilities(db, current_user=current_user, risk=risk)
        return serialize_risk_read(risk, monitoring_context, capabilities=capabilities)

    # Allow access if user is reporting owner of any linked KRI (cross-department)
    if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
        capabilities = await risk_capabilities(db, current_user=current_user, risk=risk)
        return serialize_risk_read(risk, monitoring_context, capabilities=capabilities)

    # Allow access if user is control owner of any linked control (cross-department)
    if await is_risk_control_owner(db, current_user.id, risk_id):
        capabilities = await risk_capabilities(db, current_user=current_user, risk=risk)
        return serialize_risk_read(risk, monitoring_context, capabilities=capabilities)

    # Otherwise verify department access
    try:
        check_department_access(risk.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Risk not found")

    capabilities = await risk_capabilities(db, current_user=current_user, risk=risk)
    return serialize_risk_read(risk, monitoring_context, capabilities=capabilities)
