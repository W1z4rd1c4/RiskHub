from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import has_permission
from app.models import Control, User
from app.models.control import ControlStatus
from app.schemas.control import ControlCapabilities


async def control_capabilities(db: AsyncSession, *, current_user: User, control: Control) -> ControlCapabilities:
    can_write = has_permission(current_user, "controls", "write")
    can_execute = has_permission(current_user, "controls", "execute")
    return ControlCapabilities(
        can_log_execution=bool(can_execute and control.status != ControlStatus.archived.value),
        can_link_risk=bool(can_write and has_permission(current_user, "risks", "read")),
        can_unlink_risk=bool(can_write and has_permission(current_user, "risks", "read")),
    )
