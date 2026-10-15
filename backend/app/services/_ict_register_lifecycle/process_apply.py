"""Process state application after authorization, validation and row locking."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import Asset, Department, OrphanedItem, Process, User, Vendor


@dataclass(frozen=True, slots=True)
class ProcessOrphanCompletion:
    orphan: OrphanedItem
    resolved_by_id: int


def _advance_point_versions(
    process: Process,
    downstream_assets: Iterable[Asset],
    downstream_vendors: Iterable[Vendor],
) -> None:
    process.governance_version += 1
    for asset in {row.id: row for row in downstream_assets}.values():
        asset.governance_version += 1
    for vendor in {row.id: row for row in downstream_vendors}.values():
        vendor.governance_version += 1


async def apply_process_create(
    db: AsyncSession,
    *,
    values: Mapping[str, object],
    owner: User,
    department: Department,
) -> Process:
    """Insert an already-validated Process and assign its stable RoI code."""
    process = Process(**values, f_code=f"pending-{uuid4().hex[:12]}")
    process.process_owner = owner
    process.owning_department = department
    db.add(process)
    await db.flush()
    process.f_code = f"F{process.id}"
    return process


def apply_process_edit(
    *,
    process: Process,
    updates: Mapping[str, object],
    owner: User | None = None,
    department: Department | None = None,
    downstream_assets: Iterable[Asset] = (),
    downstream_vendors: Iterable[Vendor] = (),
    orphan_completion: ProcessOrphanCompletion | None = None,
) -> None:
    """Apply an accepted edit and exactly its caller's validated impact rows.

    Direct point mutations supply linked Assets; approved replay additionally
    supplies captured Vendors. Direct orphan repair supplies neither cascade.
    No-op filtering and impact discovery belong to the existing entry points.
    """
    for field, value in updates.items():
        setattr(process, field, value)
    if owner is not None:
        process.process_owner = owner
    if department is not None:
        process.owning_department = department
    _advance_point_versions(process, downstream_assets, downstream_vendors)
    if orphan_completion is not None:
        orphan = orphan_completion.orphan
        orphan.status = "resolved"
        orphan.resolved_at = utc_now()
        orphan.resolved_by_id = orphan_completion.resolved_by_id
        orphan.new_owner_id = process.process_owner_user_id


def apply_process_archive(
    *,
    process: Process,
    actor: User,
    downstream_assets: Iterable[Asset] = (),
    downstream_vendors: Iterable[Vendor] = (),
    restore: bool = False,
) -> None:
    if restore:
        process.mark_restored(actor)
    else:
        process.mark_archived(actor)
    _advance_point_versions(process, downstream_assets, downstream_vendors)


__all__ = ["ProcessOrphanCompletion", "apply_process_archive", "apply_process_create", "apply_process_edit"]
