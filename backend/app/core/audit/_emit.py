from __future__ import annotations

from collections.abc import Mapping
from typing import cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.audit.types import AuditLogActivity
from app.models import ActivityLog, User
from app.models.activity_log import ActivityAction, ActivityEntityType


async def emit_adapter(
    db: AsyncSession,
    *,
    entity_type: ActivityEntityType,
    entity_id: int,
    entity_name: str,
    safe_entity_label: str,
    action: ActivityAction,
    actor: User | None,
    department_id: int | None,
    changes: dict[str, dict[str, object]] | Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
    safe_description: str | None = None,
    safe_description_siem: str | None = None,
) -> ActivityLog:
    kwargs: dict[str, object] = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "safe_entity_label": safe_entity_label,
        "action": action,
        "actor": actor,
        "department_id": department_id,
    }
    if changes is not None:
        kwargs["changes"] = changes
    if description is not None:
        kwargs["description"] = description
    if safe_description is not None:
        kwargs["safe_description"] = safe_description
    if safe_description_siem is not None:
        kwargs["safe_description_siem"] = safe_description_siem
    return cast(ActivityLog, await log_activity_func(db, **kwargs))
