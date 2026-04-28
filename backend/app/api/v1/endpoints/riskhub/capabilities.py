from fastapi import APIRouter, Depends

from app.models import User
from app.schemas.riskhub import RiskHubCapabilitiesRead, RiskHubPanelCapability

from ._shared import get_cro_user

router = APIRouter()


@router.get("/capabilities", response_model=RiskHubCapabilitiesRead)
async def get_riskhub_capabilities(
    cro_user: User = Depends(get_cro_user),
) -> RiskHubCapabilitiesRead:
    """Return collection-level Risk Hub action capabilities for the current CRO."""
    return RiskHubCapabilitiesRead(
        risk_types=RiskHubPanelCapability(can_create=True),
        departments=RiskHubPanelCapability(can_create=True),
        roles=RiskHubPanelCapability(can_create=True),
        approval_scenarios=RiskHubPanelCapability(can_update=True),
        system_settings=RiskHubPanelCapability(can_update=True),
        questionnaires=RiskHubPanelCapability(can_batch_send=True),
    )
