from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import (
    load_monitoring_response_context,
    serialize_control_risk_link,
)
from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access, visible_risk_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlRiskLink, Risk, User
from app.schemas.risk import ControlRiskLinkCreate, ControlRiskLinkRead

router = APIRouter()


# ============== Control-Risk Linking Endpoints ==============


@router.get("/{control_id}/risks", response_model=list[ControlRiskLinkRead])
async def list_control_risks(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
):
    """List risks that this control mitigates."""
    from app.core.permissions import is_control_owner

    # Verify control exists
    control_result = await db.execute(select(Control).where(Control.id == control_id))
    control = control_result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Allow access via control ownership (cross-department) per BUSINESS_LOGIC.md §7.1
    is_owner = await is_control_owner(db, current_user.id, control_id)
    if not is_owner:
        # Fall back to department access check
        try:
            check_department_access(control.department_id, current_user)
        except HTTPException:
            raise HTTPException(status_code=404, detail="Control not found")

    links_result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.risk),
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
        )
        .where(ControlRiskLink.control_id == control_id)
    )
    links = links_result.scalars().all()

    readable_risk_ids = await visible_risk_ids(
        db,
        current_user,
        [link.risk_id for link in links if link.risk_id is not None],
    )
    for link in links:
        if not link.risk:
            continue
        if link.risk.id not in readable_risk_ids:
            cast(Any, link).risk = None

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return [serialize_control_risk_link(link, monitoring_context) for link in links]


@router.post("/{control_id}/risks", response_model=ControlRiskLinkRead, status_code=status.HTTP_201_CREATED)
async def link_control_to_risk(
    control_id: int,
    link_data: ControlRiskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Link a control to a risk."""
    from app.core.permissions import is_control_owner, is_risk_control_owner, is_risk_kri_reporting_owner
    from app.models import Risk

    # Verify control exists
    control_result = await db.execute(select(Control).where(Control.id == control_id))
    control = control_result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Allow access via control ownership (cross-department) per BUSINESS_LOGIC.md §7.1
    is_ctrl_owner = await is_control_owner(db, current_user.id, control_id)
    if not is_ctrl_owner:
        check_department_access(control.department_id, current_user)

    # Verify risk exists
    risk_result = await db.execute(select(Risk).where(Risk.id == link_data.risk_id))
    risk = risk_result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    # Verify access to risk (ownership OR department) - prevents linking to inaccessible risks
    has_risk_access = False
    if await is_risk_kri_reporting_owner(db, current_user.id, link_data.risk_id):
        has_risk_access = True
    elif await is_risk_control_owner(db, current_user.id, link_data.risk_id):
        has_risk_access = True
    elif risk.owner_id == current_user.id:
        has_risk_access = True
    else:
        try:
            check_department_access(risk.department_id, current_user)
            has_risk_access = True
        except HTTPException:
            pass

    if not has_risk_access:
        raise HTTPException(status_code=403, detail="Access denied to risk")

    # Check if link already exists
    existing_link_result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.control_id == control_id)
        .where(ControlRiskLink.risk_id == link_data.risk_id)
    )
    if existing_link_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")

    link = ControlRiskLink(
        control_id=control_id,
        risk_id=link_data.risk_id,
        effectiveness=link_data.effectiveness.value,
        notes=link_data.notes,
    )

    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Reload with relationships
    reloaded_link_result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.risk),
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
        )
        .where(ControlRiskLink.id == link.id)
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_control_risk_link(reloaded_link_result.scalar_one(), monitoring_context)


@router.delete("/{control_id}/risks/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_control_from_risk(
    control_id: int,
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Remove link between control and risk."""
    from app.core.permissions import is_control_owner, is_risk_control_owner, is_risk_kri_reporting_owner

    link_result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.control_id == control_id)
        .where(ControlRiskLink.risk_id == risk_id)
    )
    link = link_result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    # Verify access for control (ownership or department)
    control_result = await db.execute(select(Control).where(Control.id == control_id))
    control = control_result.scalar_one_or_none()
    if control:
        is_ctrl_owner = await is_control_owner(db, current_user.id, control_id)
        if not is_ctrl_owner:
            check_department_access(control.department_id, current_user)

    # Verify access for risk (ownership or department)
    risk_result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = risk_result.scalar_one_or_none()
    if risk:
        has_risk_access = False
        if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
            has_risk_access = True
        elif await is_risk_control_owner(db, current_user.id, risk_id):
            has_risk_access = True
        elif risk.owner_id == current_user.id:
            has_risk_access = True
        else:
            try:
                check_department_access(risk.department_id, current_user)
                has_risk_access = True
            except HTTPException:
                pass

        if not has_risk_access:
            raise HTTPException(status_code=403, detail="Access denied to risk")

    await db.delete(link)
    await db.commit()
