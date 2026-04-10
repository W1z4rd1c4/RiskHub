from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import (
    load_monitoring_response_context,
    serialize_control_risk_link,
)
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_risk_id, check_department_access, is_control_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Control, ControlRiskLink, Risk, User
from app.schemas.risk import ControlRiskLinkFromRisk, ControlRiskLinkRead

router = APIRouter()


@router.get("/{risk_id}/controls", response_model=list[ControlRiskLinkRead])
async def list_risk_controls(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """List controls that mitigate this risk."""
    from app.core.permissions import can_access_department_id, get_control_ids_where_owner

    if not check_permission(current_user, "controls", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: controls:read")

    # Anti-enumeration: 404 if risk not found OR not visible by scope/ownership
    if not await can_read_risk_id(db, current_user, risk_id):
        raise HTTPException(status_code=404, detail="Risk not found")

    owned_control_ids = set(await get_control_ids_where_owner(db, current_user.id))

    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.risk_id == risk_id)
    )
    links = result.scalars().all()
    visible_links: list[ControlRiskLink] = []
    for link in links:
        if not link.control:
            continue
        if can_access_department_id(current_user, link.control.department_id) or (link.control.id in owned_control_ids):
            visible_links.append(link)
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return [serialize_control_risk_link(link, monitoring_context) for link in visible_links]


@router.post("/{risk_id}/controls", response_model=ControlRiskLinkRead, status_code=status.HTTP_201_CREATED)
async def link_risk_to_control(
    risk_id: int,
    link_data: ControlRiskLinkFromRisk,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Link a risk to a control."""
    from app.core.permissions import is_risk_control_owner, is_risk_kri_reporting_owner
    from app.models import Control

    # Verify risk exists
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    # Allow access via ownership (same pattern as GET /risks/{id})
    has_risk_access = False
    if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
        has_risk_access = True
    elif await is_risk_control_owner(db, current_user.id, risk_id):
        has_risk_access = True
    else:
        try:
            check_department_access(risk.department_id, current_user)
            has_risk_access = True
        except HTTPException:
            pass

    if not has_risk_access:
        raise HTTPException(status_code=403, detail="Access denied to risk")

    # Verify control exists
    result = await db.execute(select(Control).where(Control.id == link_data.control_id))
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Verify access for control: ownership OR department
    from app.core.permissions import is_control_owner

    is_ctrl_owner = await is_control_owner(db, current_user.id, control.id)
    if not is_ctrl_owner:
        check_department_access(control.department_id, current_user)

    # Check if link already exists
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.risk_id == risk_id)
        .where(ControlRiskLink.control_id == link_data.control_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")

    link = ControlRiskLink(
        control_id=link_data.control_id,
        risk_id=risk_id,
        effectiveness=link_data.effectiveness.value,
        notes=link_data.notes,
    )

    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Reload with relationships
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.id == link.id)
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_control_risk_link(result.scalar_one(), monitoring_context)


@router.delete("/{risk_id}/controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_risk_from_control(
    risk_id: int,
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Remove link between risk and control."""
    from app.core.permissions import is_risk_control_owner, is_risk_kri_reporting_owner

    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.risk_id == risk_id)
        .where(ControlRiskLink.control_id == control_id)
    )
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    # Verify access for risk (ownership or department)
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if risk:
        has_risk_access = False
        if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
            has_risk_access = True
        elif await is_risk_control_owner(db, current_user.id, risk_id):
            has_risk_access = True
        else:
            try:
                check_department_access(risk.department_id, current_user)
                has_risk_access = True
            except HTTPException:
                pass

        if not has_risk_access:
            raise HTTPException(status_code=403, detail="Access denied to risk")

    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()
    if control:
        is_ctrl_owner = await is_control_owner(db, current_user.id, control.id)
        if not is_ctrl_owner:
            check_department_access(control.department_id, current_user)

    await db.delete(link)
    await db.commit()
