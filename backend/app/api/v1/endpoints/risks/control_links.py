from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._monitoring_response import (
    serialize_control_risk_link,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.risk import ControlRiskLinkFromRisk, ControlRiskLinkRead
from app.services._control_execution import (
    create_risk_control_link,
    delete_risk_control_link,
    list_risk_control_links,
)

router = APIRouter()


@router.get("/{risk_id}/controls", response_model=list[ControlRiskLinkRead])
async def list_risk_controls(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """List controls that mitigate this risk."""
    outcomes = await list_risk_control_links(db, risk_id=risk_id, current_user=current_user)
    return [serialize_control_risk_link(outcome.link, outcome.monitoring_context) for outcome in outcomes]


@router.post("/{risk_id}/controls", response_model=ControlRiskLinkRead, status_code=status.HTTP_201_CREATED)
async def link_risk_to_control(
    risk_id: int,
    link_data: ControlRiskLinkFromRisk,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Link a risk to a control."""
    outcome = await create_risk_control_link(
        db,
        control_id=link_data.control_id,
        risk_id=risk_id,
        effectiveness=link_data.effectiveness.value,
        notes=link_data.notes,
        current_user=current_user,
    )
    return serialize_control_risk_link(outcome.link, outcome.monitoring_context)


@router.delete("/{risk_id}/controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_risk_from_control(
    risk_id: int,
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Remove link between risk and control."""
    await delete_risk_control_link(db, risk_id=risk_id, control_id=control_id, current_user=current_user)
