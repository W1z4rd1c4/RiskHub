from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import Control, User
from app.models.activity_log import ActivityAction, ActivityEntityType


def control_display_name(control: Control) -> str:
    return control.name or safe_entity_label("CTRL", control.id)


def control_update_changes(control: Control, updates: dict[str, object]) -> dict[str, dict[str, object]] | None:
    return build_change_set(control, updates)


async def control_created(
    db: AsyncSession,
    *,
    actor: User,
    control: Control,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=control_display_name(control),
        safe_entity_label=safe_entity_label("CTRL", control.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=control.department_id,
        log_activity_func=log_activity_func,
    )


async def control_updated(
    db: AsyncSession,
    *,
    actor: User,
    control: Control,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=control_display_name(control),
        safe_entity_label=safe_entity_label("CTRL", control.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=control.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def control_archived(
    db: AsyncSession,
    *,
    actor: User,
    control: Control,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=control_display_name(control),
        safe_entity_label=safe_entity_label("CTRL", control.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=control.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def control_restored(
    db: AsyncSession,
    *,
    actor: User,
    control: Control,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=control_display_name(control),
        safe_entity_label=safe_entity_label("CTRL", control.id),
        safe_description="Restored Control",
        safe_description_siem="Restored Control",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=control.department_id,
        changes=changes,
        description=f"Restored control {control.name}",
        log_activity_func=log_activity_func,
    )
