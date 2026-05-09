from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.risk import ControlRiskLinkCreate, ControlRiskLinkRead
from app.services._control_execution import (
    create_control_risk_link,
    delete_control_risk_link,
    list_control_risk_links,
)
from app.services._monitoring_response import (
    serialize_control_risk_link,
)

router = APIRouter()


# ============== Control-Risk Linking Endpoints ==============


@router.get("/{control_id}/risks", response_model=list[ControlRiskLinkRead])
async def list_control_risks(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
):
    """List risks that this control mitigates."""
    outcomes = await list_control_risk_links(db, control_id=control_id, current_user=current_user)
    return [serialize_control_risk_link(outcome.link, outcome.monitoring_context) for outcome in outcomes]


@router.post("/{control_id}/risks", response_model=ControlRiskLinkRead, status_code=status.HTTP_201_CREATED)
async def link_control_to_risk(
    control_id: int,
    link_data: ControlRiskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Link a control to a risk."""
    outcome = await create_control_risk_link(
        db,
        control_id=control_id,
        risk_id=link_data.risk_id,
        effectiveness=link_data.effectiveness.value,
        notes=link_data.notes,
        current_user=current_user,
    )
    return serialize_control_risk_link(outcome.link, outcome.monitoring_context)


@router.delete("/{control_id}/risks/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_control_from_risk(
    control_id: int,
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Remove link between control and risk."""
    await delete_control_risk_link(db, control_id=control_id, risk_id=risk_id, current_user=current_user)
