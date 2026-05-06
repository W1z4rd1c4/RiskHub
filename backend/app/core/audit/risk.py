from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.models import Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType

AuditLogActivity = Callable[..., Awaitable[None]]


def risk_display_name(risk: Risk) -> str:
    name_or_description_or_code = risk.name or (risk.description[:50] if risk.description else risk.risk_id_code)
    return f"{risk.risk_id_code}: {name_or_description_or_code}"


async def risk_created(
    db: AsyncSession,
    *,
    actor: User,
    risk: Risk,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=risk_display_name(risk),
        safe_entity_label=risk.risk_id_code,
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=risk.department_id,
    )


def risk_update_changes(
    risk: Risk,
    update_data: dict[str, Any],
    *,
    extra_changes: dict[str, dict[str, object]] | None = None,
) -> dict[str, dict[str, object]]:
    return build_change_set(risk, update_data, extra_changes=extra_changes)


async def risk_updated(
    db: AsyncSession,
    *,
    actor: User,
    risk: Risk,
    changes: dict[str, dict[str, object]],
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=risk_display_name(risk),
        safe_entity_label=risk.risk_id_code,
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=risk.department_id,
        changes=changes,
    )


async def risk_archived(
    db: AsyncSession,
    *,
    actor: User,
    risk: Risk,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=risk_display_name(risk),
        safe_entity_label=risk.risk_id_code,
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=risk.department_id,
    )
