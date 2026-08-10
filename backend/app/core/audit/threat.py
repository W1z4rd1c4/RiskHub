from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import Threat, User
from app.models.activity_log import ActivityAction, ActivityEntityType


async def threat_created(
    db: AsyncSession,
    *,
    actor: User,
    threat: Threat,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.THREAT,
        entity_id=threat.id,
        entity_name=threat.name,
        safe_entity_label=safe_entity_label("THR", threat.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=None,
        description=f"Created threat {threat.name}",
        log_activity_func=log_activity_func,
    )


def threat_update_changes(threat: Threat, updates: dict[str, object]) -> dict[str, dict[str, object]]:
    return build_change_set(threat, updates) or {}


async def threat_updated(
    db: AsyncSession,
    *,
    actor: User,
    threat: Threat,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.THREAT,
        entity_id=threat.id,
        entity_name=threat.name,
        safe_entity_label=safe_entity_label("THR", threat.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=None,
        changes=changes,
        log_activity_func=log_activity_func,
    )


def threat_archive_changes(threat: Threat) -> dict[str, dict[str, object]]:
    return build_change_set(threat, {"is_archived": True}) or {}


async def threat_archived(
    db: AsyncSession,
    *,
    actor: User,
    threat: Threat,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.THREAT,
        entity_id=threat.id,
        entity_name=threat.name,
        safe_entity_label=safe_entity_label("THR", threat.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=None,
        changes=changes,
        description=f"Archived threat {threat.name}",
        log_activity_func=log_activity_func,
    )


def threat_restore_changes(threat: Threat) -> dict[str, dict[str, object]]:
    return build_change_set(threat, {"is_archived": False}) or {}


async def threat_restored(
    db: AsyncSession,
    *,
    actor: User,
    threat: Threat,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.THREAT,
        entity_id=threat.id,
        entity_name=threat.name,
        safe_entity_label=safe_entity_label("THR", threat.id),
        safe_description="Restored Threat",
        safe_description_siem="Restored Threat",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=None,
        changes=changes,
        description=f"Restored threat {threat.name}",
        log_activity_func=log_activity_func,
    )


async def threat_link_created(
    db: AsyncSession,
    *,
    actor: User,
    threat: Threat,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.THREAT_LINK,
        entity_id=threat.id,
        entity_name=f"{threat.name} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("THRLINK", threat.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=None,
        changes={
            "link_kind": {"old": None, "new": link_kind},
            "target_id": {"old": None, "new": target_id},
            "threat_id": {"old": None, "new": threat.id},
        },
        description=f"Created threat {link_kind} link",
        log_activity_func=log_activity_func,
    )


async def threat_link_deleted(
    db: AsyncSession,
    *,
    actor: User,
    threat: Threat,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.THREAT_LINK,
        entity_id=threat.id,
        entity_name=f"{threat.name} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("THRLINK", threat.id),
        action=ActivityAction.DELETE,
        actor=actor,
        department_id=None,
        changes={
            "link_kind": {"old": None, "new": link_kind},
            "target_id": {"old": None, "new": target_id},
            "threat_id": {"old": None, "new": threat.id},
        },
        description=f"Deleted threat {link_kind} link",
        log_activity_func=log_activity_func,
    )
