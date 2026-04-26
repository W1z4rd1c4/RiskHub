from fastapi import Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_control_read
from app.core.activity_logger import log_activity
from app.core.datetime_utils import utc_now
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import ControlCreate, ControlRead
from app.services._control_execution import control_capabilities

from .list import router


@router.post("", response_model=ControlRead, status_code=status.HTTP_201_CREATED)
async def create_control(
    control_data: ControlCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Create a new control. Requires controls:write permission."""
    # Verify department access
    check_department_access(control_data.department_id, current_user)
    await validate_active_owner_reference(
        db,
        user_id=control_data.control_owner_id,
        label="Control owner",
    )

    control = Control(
        name=control_data.name,
        description=control_data.description,
        data_source=control_data.data_source,
        methodology_reference=control_data.methodology_reference,
        control_form=control_data.control_form.value,
        process_owner_position=control_data.process_owner_position,
        control_owner_id=control_data.control_owner_id,
        executor_position=control_data.executor_position,
        frequency=control_data.frequency.value,
        risk_level=control_data.risk_level,
        output_description=control_data.output_description,
        report_recipient=control_data.report_recipient,
        documentation_location=control_data.documentation_location,
        department_id=control_data.department_id,
        status=control_data.status.value,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )

    db.add(control)
    await db.flush()

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=control.department_id,
    )
    await db.commit()
    await db.refresh(control)

    # Reload with relationships
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
