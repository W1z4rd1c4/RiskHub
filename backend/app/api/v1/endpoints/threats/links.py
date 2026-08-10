from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.threat import ThreatRiskLinkCreate, ThreatRiskLinkRead
from app.services._ict_register_lifecycle.threat_links import (
    add_threat_risk_link,
    list_threat_risk_links,
    remove_threat_risk_link,
)

router = APIRouter()


@router.get("/{threat_id}/risk-links", response_model=list[ThreatRiskLinkRead])
async def list_threat_risk_links_route(
    threat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "read")),
):
    return await list_threat_risk_links(db, threat_id=threat_id, current_user=current_user)


@router.post(
    "/{threat_id}/risk-links",
    response_model=ThreatRiskLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_threat_risk_link(
    threat_id: int,
    payload: ThreatRiskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "write")),
):
    return await add_threat_risk_link(db, threat_id=threat_id, payload=payload, current_user=current_user)


@router.delete("/{threat_id}/risk-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_threat_risk_link(
    threat_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "write")),
):
    await remove_threat_risk_link(db, threat_id=threat_id, link_id=link_id, current_user=current_user)
    return None
