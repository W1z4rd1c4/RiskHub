from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.vendor import VendorStatusEnum

AuditLogActivity = Callable[..., Awaitable[None]]


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
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=vendor.department_id,
        description=f"Created vendor {vendor.name}",
    )


def vendor_update_changes(vendor: Vendor, updates: dict[str, object]) -> dict[str, dict[str, object]]:
    return build_change_set(vendor, updates)


async def vendor_updated(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    changes: dict[str, dict[str, object]],
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=vendor.department_id,
        changes=changes,
    )


def vendor_archive_changes(vendor: Vendor) -> dict[str, dict[str, object]]:
    return build_change_set(vendor, {"status": "inactive"})


async def vendor_archived(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    changes: dict[str, dict[str, object]],
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Archived vendor {vendor.name}",
    )


def vendor_restore_changes(vendor: Vendor) -> dict[str, dict[str, object]]:
    return build_change_set(vendor, {"status": VendorStatusEnum.active.value})


async def vendor_restored(
    db: AsyncSession,
    *,
    actor: User,
    vendor: Vendor,
    changes: dict[str, dict[str, object]],
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        safe_description="Restored Vendor",
        safe_description_siem="Restored Vendor",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Restored vendor {vendor.name}",
    )
