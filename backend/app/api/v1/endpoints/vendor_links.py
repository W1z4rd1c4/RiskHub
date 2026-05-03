from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.vendor_links import (
    LinkedControlRead,
    LinkedKRIRead,
    LinkedRiskRead,
    VendorControlLinkCreate,
    VendorKRILinkCreate,
    VendorRiskLinkCreate,
)
from app.services._vendor_links import (
    link_vendor_target,
    list_vendor_linked_controls,
    list_vendor_linked_kris,
    list_vendor_linked_risks,
    unlink_vendor_target,
)

router = APIRouter()


@router.get("/vendors/{vendor_id}/linked-risks", response_model=list[LinkedRiskRead])
async def list_vendor_linked_risks_route(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await list_vendor_linked_risks(db, vendor_id=vendor_id, current_user=current_user)


@router.post("/vendors/{vendor_id}/linked-risks", status_code=status.HTTP_201_CREATED)
async def link_vendor_to_risk(
    vendor_id: int,
    payload: VendorRiskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await link_vendor_target(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
        kind="risk",
        entity_id=payload.risk_id,
    )


@router.delete("/vendors/{vendor_id}/linked-risks/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_vendor_from_risk(
    vendor_id: int,
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    await unlink_vendor_target(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
        kind="risk",
        entity_id=risk_id,
    )
    return None


@router.get("/vendors/{vendor_id}/linked-controls", response_model=list[LinkedControlRead])
async def list_vendor_linked_controls_route(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await list_vendor_linked_controls(db, vendor_id=vendor_id, current_user=current_user)


@router.post("/vendors/{vendor_id}/linked-controls", status_code=status.HTTP_201_CREATED)
async def link_vendor_to_control(
    vendor_id: int,
    payload: VendorControlLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await link_vendor_target(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
        kind="control",
        entity_id=payload.control_id,
    )


@router.delete("/vendors/{vendor_id}/linked-controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_vendor_from_control(
    vendor_id: int,
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    await unlink_vendor_target(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
        kind="control",
        entity_id=control_id,
    )
    return None


@router.get("/vendors/{vendor_id}/linked-kris", response_model=list[LinkedKRIRead])
async def list_vendor_linked_kris_route(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await list_vendor_linked_kris(db, vendor_id=vendor_id, current_user=current_user)


@router.post("/vendors/{vendor_id}/linked-kris", status_code=status.HTTP_201_CREATED)
async def link_vendor_to_kri(
    vendor_id: int,
    payload: VendorKRILinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await link_vendor_target(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
        kind="kri",
        entity_id=payload.kri_id,
    )


@router.delete("/vendors/{vendor_id}/linked-kris/{kri_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_vendor_from_kri(
    vendor_id: int,
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    await unlink_vendor_target(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
        kind="kri",
        entity_id=kri_id,
    )
    return None
