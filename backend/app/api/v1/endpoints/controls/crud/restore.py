from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_control_read
from app.core.audit.control import control_restored
from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, User
from app.schemas.control import ControlRead
from app.services.authorization_capabilities import control_capabilities
from app.services.transaction_boundary import commit_service_transaction

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

    if not control.is_archived:
        raise HTTPException(status_code=400, detail="Control is not archived")

    before_data = {
        "is_archived": control.is_archived,
        "archived_at": control.archived_at,
        "archived_by_id": control.archived_by_id,
        "updated_by_id": control.updated_by_id,
    }
    control.mark_restored(current_user)
    control.updated_by_id = current_user.id
    after_data = {
        "is_archived": control.is_archived,
        "archived_at": control.archived_at,
        "archived_by_id": control.archived_by_id,
        "updated_by_id": control.updated_by_id,
    }

    await control_restored(db, actor=current_user, control=control, before_data=before_data, after_data=after_data)
    await commit_service_transaction(db)
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
