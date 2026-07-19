from __future__ import annotations

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.asset import ProcessAssetLinkRead
from app.schemas.process import (
    ProcessRelationshipMutationRequest,
    ProcessVendorLinkCreate,
    ProcessVendorLinkRead,
)
from app.schemas.risk import RiskProcessLinkRead
from app.services._ict_register_lifecycle.asset_links import list_process_asset_links
from app.services._ict_register_lifecycle.risk_links import list_process_risk_links
from app.services._ict_register_lifecycle.vendor_links import (
    add_process_vendor_link,
    list_process_vendor_links,
    remove_process_vendor_link,
)

router = APIRouter()


@router.get("/{process_id}/asset-links", response_model=list[ProcessAssetLinkRead])
async def list_process_asset_links_route(
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "read")),
):
    """The Process-end read of the Process<->Asset Link relation (issue #43)."""
    return await list_process_asset_links(db, process_id=process_id, current_user=current_user)


@router.get("/{process_id}/risk-links", response_model=list[RiskProcessLinkRead])
async def list_process_risk_links_route(
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "read")),
):
    """The Process-end read of the Risk<->Process Link relation (issue #47, read-only)."""
    return await list_process_risk_links(db, process_id=process_id, current_user=current_user)


@router.get("/{process_id}/vendor-links", response_model=list[ProcessVendorLinkRead])
async def list_process_vendor_links_route(
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await list_process_vendor_links(db, process_id=process_id, current_user=current_user)


@router.post(
    "/{process_id}/vendor-links",
    response_model=ProcessVendorLinkRead,
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def create_process_vendor_link(
    process_id: int,
    payload: ProcessVendorLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await add_process_vendor_link(db, process_id=process_id, payload=payload, current_user=current_user)


@router.delete(
    "/{process_id}/vendor-links/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def delete_process_vendor_link(
    process_id: int,
    link_id: int,
    payload: ProcessRelationshipMutationRequest = Body(default_factory=ProcessRelationshipMutationRequest),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await remove_process_vendor_link(
        db,
        process_id=process_id,
        link_id=link_id,
        request_reason=payload.request_reason,
        current_user=current_user,
    )
