"""Vendor state application after the caller's authorization and lock checks."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import OrphanedItem, User, Vendor, VendorContract, VendorSubOutsourcing

VendorChildT = TypeVar("VendorChildT", VendorContract, VendorSubOutsourcing)


@dataclass(frozen=True, slots=True)
class VendorOrphanCompletion:
    """Already-validated and locked ownership evidence to complete with an edit."""

    orphan: OrphanedItem
    resolved_by_id: int


def apply_vendor_edit(
    *,
    vendor: Vendor,
    updates: Mapping[str, object],
    outsourcing_owner: User | None = None,
    orphan_completion: VendorOrphanCompletion | None = None,
    version_rule: Literal["always", "owner_changed"] = "always",
) -> None:
    """Apply validated state without auditing, flushing, or completing a transaction.

    Accepted edits advance the version once, including approved replay. Direct
    lifecycle callers filter no-ops before invoking this method. Direct orphan
    resolution uses ``owner_changed`` and completes its evidence even when the
    owner is unchanged; approved orphan edits retain the ordinary edit rule.
    """
    if version_rule not in {"always", "owner_changed"}:
        raise ValueError("Unsupported Vendor edit version rule")
    previous_owner_id = vendor.outsourcing_owner_user_id
    for field, value in updates.items():
        setattr(vendor, field, value.value if hasattr(value, "value") else value)
    if outsourcing_owner is not None:
        vendor.outsourcing_owner = outsourcing_owner
    if version_rule == "always" or previous_owner_id != vendor.outsourcing_owner_user_id:
        vendor.governance_version += 1
    if orphan_completion is not None:
        orphan = orphan_completion.orphan
        orphan.status = "resolved"
        orphan.resolved_at = utc_now()
        orphan.resolved_by_id = orphan_completion.resolved_by_id
        orphan.new_owner_id = vendor.outsourcing_owner_user_id


async def apply_vendor_create(db: AsyncSession, *, values: Mapping[str, object]) -> Vendor:
    vendor = Vendor(**values)
    db.add(vendor)
    await db.flush()
    return vendor


def apply_vendor_archive(*, vendor: Vendor, actor: User, restore: bool = False) -> None:
    if restore:
        vendor.mark_restored(actor)
    else:
        vendor.mark_archived(actor)
    vendor.governance_version += 1


async def apply_vendor_child_create(
    db: AsyncSession,
    *,
    vendor: Vendor,
    child_model: type[VendorChildT],
    values: Mapping[str, object],
) -> VendorChildT:
    child = child_model(vendor_id=vendor.id, **values)
    db.add(child)
    await db.flush()
    vendor.governance_version += 1
    return child


def apply_vendor_child_edit(
    *, vendor: Vendor, child: VendorContract | VendorSubOutsourcing, updates: Mapping[str, object]
) -> None:
    for field, value in updates.items():
        setattr(child, field, value)
    vendor.governance_version += 1


def apply_vendor_child_archive(
    *, vendor: Vendor, child: VendorContract | VendorSubOutsourcing, actor: User, restore: bool = False
) -> None:
    if restore:
        child.mark_restored(actor)
    else:
        child.mark_archived(actor)
    vendor.governance_version += 1
