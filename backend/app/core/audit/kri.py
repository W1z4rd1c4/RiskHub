from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.models import KeyRiskIndicator, KRIValueHistory, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services._kri_history.governance import build_kri_value_history_activity_changes

AuditLogActivity = Callable[..., Awaitable[None]]


async def kri_value_created(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    history_entry: KRIValueHistory,
    value: float,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    entity_label = f"{kri.metric_name} ({history_entry.period_end.isoformat()})"
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI_VALUE,
        entity_id=history_entry.id,
        entity_name=entity_label,
        safe_entity_label=entity_label,
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=kri.risk.department_id if kri.risk else None,
        changes=build_kri_value_history_activity_changes(
            old_value=None,
            new_value=value,
            period_end=history_entry.period_end,
        ),
    )


async def kri_value_mutation_updated(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    changes: dict[str, dict[str, object]],
    description: str,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=kri.metric_name,
        safe_entity_label=kri.metric_name,
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=kri.risk.department_id if kri.risk else None,
        changes=changes,
        description=description,
    )
