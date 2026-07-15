from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import Asset, User
from app.models.activity_log import ActivityAction, ActivityEntityType


async def asset_created(
    db: AsyncSession,
    *,
    actor: User,
    asset: Asset,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ASSET,
        entity_id=asset.id,
        entity_name=asset.name,
        safe_entity_label=safe_entity_label("AST", asset.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=asset.owning_department_id,
        description=f"Created asset {asset.name}",
        log_activity_func=log_activity_func,
    )


def asset_update_changes(asset: Asset, updates: dict[str, object]) -> dict[str, dict[str, object]]:
    return build_change_set(asset, updates) or {}


async def asset_updated(
    db: AsyncSession,
    *,
    actor: User,
    asset: Asset,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ASSET,
        entity_id=asset.id,
        entity_name=asset.name,
        safe_entity_label=safe_entity_label("AST", asset.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=asset.owning_department_id,
        changes=changes,
        log_activity_func=log_activity_func,
    )


def asset_archive_changes(asset: Asset) -> dict[str, dict[str, object]]:
    return build_change_set(asset, {"is_archived": True}) or {}


async def asset_archived(
    db: AsyncSession,
    *,
    actor: User,
    asset: Asset,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ASSET,
        entity_id=asset.id,
        entity_name=asset.name,
        safe_entity_label=safe_entity_label("AST", asset.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=asset.owning_department_id,
        changes=changes,
        description=f"Archived asset {asset.name}",
        log_activity_func=log_activity_func,
    )


def asset_restore_changes(asset: Asset) -> dict[str, dict[str, object]]:
    return build_change_set(asset, {"is_archived": False}) or {}


async def asset_restored(
    db: AsyncSession,
    *,
    actor: User,
    asset: Asset,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ASSET,
        entity_id=asset.id,
        entity_name=asset.name,
        safe_entity_label=safe_entity_label("AST", asset.id),
        safe_description="Restored Asset",
        safe_description_siem="Restored Asset",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=asset.owning_department_id,
        changes=changes,
        description=f"Restored asset {asset.name}",
        log_activity_func=log_activity_func,
    )


async def asset_link_created(
    db: AsyncSession,
    *,
    actor: User,
    asset: Asset,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ASSET_LINK,
        entity_id=asset.id,
        entity_name=f"{asset.name} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("ASTLINK", asset.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=asset.owning_department_id,
        changes={
            "link_kind": {"old": None, "new": link_kind},
            "target_id": {"old": None, "new": target_id},
            "asset_id": {"old": None, "new": asset.id},
        },
        description=f"Created asset {link_kind} link",
        log_activity_func=log_activity_func,
    )


async def asset_link_updated(
    db: AsyncSession,
    *,
    actor: User,
    asset: Asset,
    link_kind: str,
    target_id: int,
    changes: dict[str, dict[str, object]],
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ASSET_LINK,
        entity_id=asset.id,
        entity_name=f"{asset.name} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("ASTLINK", asset.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=asset.owning_department_id,
        changes=changes,
        description=f"Updated asset {link_kind} link",
        log_activity_func=log_activity_func,
    )


async def asset_link_deleted(
    db: AsyncSession,
    *,
    actor: User,
    asset: Asset,
    link_kind: str,
    target_id: int,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ASSET_LINK,
        entity_id=asset.id,
        entity_name=f"{asset.name} {link_kind} link {target_id}",
        safe_entity_label=safe_entity_label("ASTLINK", asset.id),
        action=ActivityAction.DELETE,
        actor=actor,
        department_id=asset.owning_department_id,
        changes={
            "link_kind": {"old": None, "new": link_kind},
            "target_id": {"old": None, "new": target_id},
            "asset_id": {"old": None, "new": asset.id},
        },
        description=f"Deleted asset {link_kind} link",
        log_activity_func=log_activity_func,
    )
