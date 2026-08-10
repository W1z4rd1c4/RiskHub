from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import User, VendorContract
from app.models.activity_log import ActivityAction, ActivityEntityType


def _contract_entity_name(contract: VendorContract) -> str:
    return contract.contract_reference or f"vendor contract {contract.id}"


async def vendor_contract_created(
    db: AsyncSession,
    *,
    actor: User,
    contract: VendorContract,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_CONTRACT,
        entity_id=contract.id,
        entity_name=_contract_entity_name(contract),
        safe_entity_label=safe_entity_label("VENCON", contract.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=None,
        description=f"Created vendor contract {_contract_entity_name(contract)}",
        log_activity_func=log_activity_func,
    )


def vendor_contract_update_changes(
    contract: VendorContract, updates: dict[str, object]
) -> dict[str, dict[str, object]]:
    return build_change_set(contract, updates) or {}


async def vendor_contract_updated(
    db: AsyncSession,
    *,
    actor: User,
    contract: VendorContract,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_CONTRACT,
        entity_id=contract.id,
        entity_name=_contract_entity_name(contract),
        safe_entity_label=safe_entity_label("VENCON", contract.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=None,
        changes=changes,
        log_activity_func=log_activity_func,
    )


def vendor_contract_archive_changes(contract: VendorContract) -> dict[str, dict[str, object]]:
    return build_change_set(contract, {"is_archived": True}) or {}


async def vendor_contract_archived(
    db: AsyncSession,
    *,
    actor: User,
    contract: VendorContract,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_CONTRACT,
        entity_id=contract.id,
        entity_name=_contract_entity_name(contract),
        safe_entity_label=safe_entity_label("VENCON", contract.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=None,
        changes=changes,
        description=f"Archived vendor contract {_contract_entity_name(contract)}",
        log_activity_func=log_activity_func,
    )


def vendor_contract_restore_changes(contract: VendorContract) -> dict[str, dict[str, object]]:
    return build_change_set(contract, {"is_archived": False}) or {}


async def vendor_contract_restored(
    db: AsyncSession,
    *,
    actor: User,
    contract: VendorContract,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.VENDOR_CONTRACT,
        entity_id=contract.id,
        entity_name=_contract_entity_name(contract),
        safe_entity_label=safe_entity_label("VENCON", contract.id),
        safe_description="Restored Vendor Contract",
        safe_description_siem="Restored Vendor Contract",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=None,
        changes=changes,
        description=f"Restored vendor contract {_contract_entity_name(contract)}",
        log_activity_func=log_activity_func,
    )
