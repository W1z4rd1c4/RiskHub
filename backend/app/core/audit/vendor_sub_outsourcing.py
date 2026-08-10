from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import User, VendorSubOutsourcing
from app.models.activity_log import ActivityAction, ActivityEntityType


def _sub_outsourcing_entity_name(entry: VendorSubOutsourcing) -> str:
    return entry.sub_provider_name or f"vendor sub-outsourcing {entry.id}"


async def vendor_sub_outsourcing_created(
    db: AsyncSession,
    *,
    actor: User,
    entry: VendorSubOutsourcing,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_SUB_OUTSOURCING,
        entity_id=entry.id,
        entity_name=_sub_outsourcing_entity_name(entry),
        safe_entity_label=safe_entity_label("VENSUB", entry.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=None,
        description=f"Created vendor sub-outsourcing {_sub_outsourcing_entity_name(entry)}",
        log_activity_func=log_activity_func,
    )


def vendor_sub_outsourcing_update_changes(
    entry: VendorSubOutsourcing, updates: dict[str, object]
) -> dict[str, dict[str, object]]:
    return build_change_set(entry, updates) or {}


async def vendor_sub_outsourcing_updated(
    db: AsyncSession,
    *,
    actor: User,
    entry: VendorSubOutsourcing,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_SUB_OUTSOURCING,
        entity_id=entry.id,
        entity_name=_sub_outsourcing_entity_name(entry),
        safe_entity_label=safe_entity_label("VENSUB", entry.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=None,
        changes=changes,
        log_activity_func=log_activity_func,
    )


def vendor_sub_outsourcing_archive_changes(entry: VendorSubOutsourcing) -> dict[str, dict[str, object]]:
    return build_change_set(entry, {"is_archived": True}) or {}


async def vendor_sub_outsourcing_archived(
    db: AsyncSession,
    *,
    actor: User,
    entry: VendorSubOutsourcing,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_SUB_OUTSOURCING,
        entity_id=entry.id,
        entity_name=_sub_outsourcing_entity_name(entry),
        safe_entity_label=safe_entity_label("VENSUB", entry.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=None,
        changes=changes,
        description=f"Archived vendor sub-outsourcing {_sub_outsourcing_entity_name(entry)}",
        log_activity_func=log_activity_func,
    )


def vendor_sub_outsourcing_restore_changes(entry: VendorSubOutsourcing) -> dict[str, dict[str, object]]:
    return build_change_set(entry, {"is_archived": False}) or {}


async def vendor_sub_outsourcing_restored(
    db: AsyncSession,
    *,
    actor: User,
    entry: VendorSubOutsourcing,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_SUB_OUTSOURCING,
        entity_id=entry.id,
        entity_name=_sub_outsourcing_entity_name(entry),
        safe_entity_label=safe_entity_label("VENSUB", entry.id),
        safe_description="Restored Vendor Sub-outsourcing",
        safe_description_siem="Restored Vendor Sub-outsourcing",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=None,
        changes=changes,
        description=f"Restored vendor sub-outsourcing {_sub_outsourcing_entity_name(entry)}",
        log_activity_func=log_activity_func,
    )
