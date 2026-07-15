from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import Process, User
from app.models.activity_log import ActivityAction, ActivityEntityType


def _process_entity_name(process: Process) -> str:
    return f"{process.f_code} {process.l1_process}"


async def process_created(
    db: AsyncSession,
    *,
    actor: User,
    process: Process,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.PROCESS,
        entity_id=process.id,
        entity_name=_process_entity_name(process),
        safe_entity_label=safe_entity_label("PROC", process.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=process.owning_department_id,
        description=f"Created process {_process_entity_name(process)}",
        log_activity_func=log_activity_func,
    )


def process_update_changes(process: Process, updates: dict[str, object]) -> dict[str, dict[str, object]]:
    return build_change_set(process, updates) or {}


async def process_updated(
    db: AsyncSession,
    *,
    actor: User,
    process: Process,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.PROCESS,
        entity_id=process.id,
        entity_name=_process_entity_name(process),
        safe_entity_label=safe_entity_label("PROC", process.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=process.owning_department_id,
        changes=changes,
        log_activity_func=log_activity_func,
    )


def process_archive_changes(process: Process) -> dict[str, dict[str, object]]:
    return build_change_set(process, {"is_archived": True}) or {}


async def process_archived(
    db: AsyncSession,
    *,
    actor: User,
    process: Process,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.PROCESS,
        entity_id=process.id,
        entity_name=_process_entity_name(process),
        safe_entity_label=safe_entity_label("PROC", process.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=process.owning_department_id,
        changes=changes,
        description=f"Archived process {_process_entity_name(process)}",
        log_activity_func=log_activity_func,
    )


def process_restore_changes(process: Process) -> dict[str, dict[str, object]]:
    return build_change_set(process, {"is_archived": False}) or {}


async def process_restored(
    db: AsyncSession,
    *,
    actor: User,
    process: Process,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.PROCESS,
        entity_id=process.id,
        entity_name=_process_entity_name(process),
        safe_entity_label=safe_entity_label("PROC", process.id),
        safe_description="Restored Process",
        safe_description_siem="Restored Process",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=process.owning_department_id,
        changes=changes,
        description=f"Restored process {_process_entity_name(process)}",
        log_activity_func=log_activity_func,
    )


async def process_link_created(
    db: AsyncSession,
    *,
    actor: User,
    process: Process,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.PROCESS_LINK,
        entity_id=process.id,
        entity_name=f"{_process_entity_name(process)} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("PROCLINK", process.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=None,
        changes={
            "link_kind": {"old": None, "new": link_kind},
            "target_id": {"old": None, "new": target_id},
            "process_id": {"old": None, "new": process.id},
        },
        description=f"Created process {link_kind} link",
        log_activity_func=log_activity_func,
    )


async def process_link_deleted(
    db: AsyncSession,
    *,
    actor: User,
    process: Process,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.PROCESS_LINK,
        entity_id=process.id,
        entity_name=f"{_process_entity_name(process)} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("PROCLINK", process.id),
        action=ActivityAction.DELETE,
        actor=actor,
        department_id=None,
        changes={
            "link_kind": {"old": None, "new": link_kind},
            "target_id": {"old": None, "new": target_id},
            "process_id": {"old": None, "new": process.id},
        },
        description=f"Deleted process {link_kind} link",
        log_activity_func=log_activity_func,
    )
