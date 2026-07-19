"""ICT Register Link relations managed from the Risk detail (issue #47).

The Risk end of the register graph: Threat<->Risk (also manageable from the
Threat page), Risk<->Process, and Risk<->Asset. Mutations require the Risk
end's write permission (risks:write) on top of both ends' read permissions;
reads follow the #43 dual-permission precedent plus Risk row visibility.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.process import ProcessRelationshipMutationRequest
from app.schemas.risk import (
    RiskAssetLinkCreate,
    RiskAssetLinkRead,
    RiskProcessLinkCreate,
    RiskProcessLinkRead,
)
from app.schemas.threat import RiskThreatLinkCreate, ThreatRiskLinkRead
from app.services._ict_register_lifecycle.risk_links import (
    add_risk_asset_link,
    add_risk_process_link,
    list_risk_asset_links,
    list_risk_process_links,
    remove_risk_asset_link,
    remove_risk_process_link,
)
from app.services._ict_register_lifecycle.threat_links import (
    add_risk_threat_link,
    list_risk_threat_links,
    remove_risk_threat_link,
)

router = APIRouter()


@router.get("/{risk_id}/threat-links", response_model=list[ThreatRiskLinkRead])
async def list_risk_threat_links_route(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    return await list_risk_threat_links(db, risk_id=risk_id, current_user=current_user)


@router.post(
    "/{risk_id}/threat-links",
    response_model=ThreatRiskLinkRead,
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def create_risk_threat_link(
    risk_id: int,
    payload: RiskThreatLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    return await add_risk_threat_link(db, risk_id=risk_id, payload=payload, current_user=current_user)


@router.delete("/{risk_id}/threat-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_risk_threat_link(
    risk_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    await remove_risk_threat_link(db, risk_id=risk_id, link_id=link_id, current_user=current_user)
    return None


@router.get("/{risk_id}/process-links", response_model=list[RiskProcessLinkRead])
async def list_risk_process_links_route(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    return await list_risk_process_links(db, risk_id=risk_id, current_user=current_user)


@router.post(
    "/{risk_id}/process-links",
    response_model=RiskProcessLinkRead,
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def create_risk_process_link(
    risk_id: int,
    payload: RiskProcessLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    return await add_risk_process_link(db, risk_id=risk_id, payload=payload, current_user=current_user)


@router.delete(
    "/{risk_id}/process-links/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def delete_risk_process_link(
    risk_id: int,
    link_id: int,
    payload: ProcessRelationshipMutationRequest = Body(default_factory=ProcessRelationshipMutationRequest),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    return await remove_risk_process_link(
        db,
        risk_id=risk_id,
        link_id=link_id,
        request_reason=payload.request_reason,
        current_user=current_user,
    )


@router.get("/{risk_id}/asset-links", response_model=list[RiskAssetLinkRead])
async def list_risk_asset_links_route(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    return await list_risk_asset_links(db, risk_id=risk_id, current_user=current_user)


@router.post(
    "/{risk_id}/asset-links",
    response_model=RiskAssetLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_risk_asset_link(
    risk_id: int,
    payload: RiskAssetLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    return await add_risk_asset_link(db, risk_id=risk_id, payload=payload, current_user=current_user)


@router.delete("/{risk_id}/asset-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_risk_asset_link(
    risk_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    await remove_risk_asset_link(db, risk_id=risk_id, link_id=link_id, current_user=current_user)
    return None
