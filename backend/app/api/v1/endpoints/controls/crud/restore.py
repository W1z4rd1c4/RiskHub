from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_control_read
from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import ControlRead, ControlStatusEnum
from app.services._control_execution import control_capabilities

router = APIRouter()


@router.post("/{control_id}/restore", response_model=ControlRead)
async def restore_control(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "delete")),
):
    """Restore an archived control back to active status."""
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    try:
        check_department_access(control.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Control not found")

    if control.status != ControlStatusEnum.archived.value:
        raise HTTPException(status_code=400, detail="Control is not archived")

    changes = build_change_set(
        control,
        {"status": ControlStatusEnum.active.value, "updated_by_id": current_user.id},
    )
    control.status = ControlStatusEnum.active.value
    control.updated_by_id = current_user.id

    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        safe_description="Restored Control",
        safe_description_siem="Restored Control",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=control.department_id,
        changes=changes,
        description=f"Restored control {control.name}",
    )
    await db.commit()
    await db.refresh(control)

    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .where(Control.id == control.id)
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    reloaded_control = result.scalar_one()
    capabilities = await control_capabilities(db, current_user=current_user, control=reloaded_control)
    return serialize_control_read(reloaded_control, monitoring_context, capabilities=capabilities)
