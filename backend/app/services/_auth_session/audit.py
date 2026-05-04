from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType


async def record_session_audit_plan(
    *,
    db: AsyncSession,
    user: User | None,
    plan: Any,
) -> None:
    if user is None or plan.event_type != ActivityAction.FAILED_REFRESH.value:
        return

    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.FAILED_REFRESH,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        safe_description="User refresh failed",
        safe_description_siem="User refresh failed",
        changes={
            "failure_code": plan.failure_code,
            "revoke_count": plan.revoke_count,
        },
    )
