from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType


async def vendor_created(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        safe_entity_label=safe_entity_label("VEND", vendor.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=vendor.department_id,
        description=f"Created vendor {vendor.name}",
    )


def vendor_update_changes(vendor: Vendor, updates: dict[str, object]) -> dict[str, dict[str, object]]:
    return build_change_set(vendor, updates) or {}


async def vendor_updated(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        safe_entity_label=safe_entity_label("VEND", vendor.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=vendor.department_id,
        changes=changes,
    )


def vendor_archive_changes(vendor: Vendor) -> dict[str, dict[str, object]]:
    return build_change_set(vendor, {"is_archived": True}) or {}


async def vendor_archived(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        safe_entity_label=safe_entity_label("VEND", vendor.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Archived vendor {vendor.name}",
    )


def vendor_restore_changes(vendor: Vendor) -> dict[str, dict[str, object]]:
    return build_change_set(vendor, {"is_archived": False}) or {}


async def vendor_restored(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        safe_entity_label=safe_entity_label("VEND", vendor.id),
        safe_description="Restored Vendor",
        safe_description_siem="Restored Vendor",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Restored vendor {vendor.name}",
    )


async def vendor_link_created(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR_LINK,
        entity_id=vendor.id,
        entity_name=f"{vendor.name} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("VENDLINK", vendor.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=vendor.department_id,
        changes={
            "link_kind": {"old": None, "new": link_kind},
            "target_id": {"old": None, "new": target_id},
            "vendor_id": {"old": None, "new": vendor.id},
        },
        description=f"Created vendor {link_kind} link",
    )


async def vendor_link_deleted(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR_LINK,
        entity_id=vendor.id,
        entity_name=f"{vendor.name} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("VENDLINK", vendor.id),
        action=ActivityAction.DELETE,
        actor=actor,
        department_id=vendor.department_id,
        changes={
            "link_kind": {"old": link_kind, "new": None},
            "target_id": {"old": target_id, "new": None},
            "vendor_id": {"old": vendor.id, "new": None},
        },
        description=f"Deleted vendor {link_kind} link",
    )
