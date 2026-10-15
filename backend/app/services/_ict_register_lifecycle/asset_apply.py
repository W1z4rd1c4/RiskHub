"""Asset state application after authorization, reference validation and locking."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import Asset, AssetAssetLink, AssetVendorLink, Department, OrphanedItem, RiskAssetLink, User, Vendor


@dataclass(frozen=True, slots=True)
class AssetOrphanCompletion:
    orphan: OrphanedItem
    resolved_by_id: int


def _advance_asset_versions(assets: Iterable[Asset], vendors: Iterable[Vendor]) -> None:
    for asset in {row.id: row for row in assets}.values():
        asset.governance_version += 1
    for vendor in {row.id: row for row in vendors}.values():
        vendor.governance_version += 1


async def apply_asset_create(
    db: AsyncSession,
    *,
    values: Mapping[str, object],
    business_owner: User | None = None,
    ict_owner: User | None = None,
    department: Department | None = None,
) -> Asset:
    asset = Asset(**values)
    if business_owner is not None:
        asset.business_owner = business_owner
    if ict_owner is not None:
        asset.ict_owner = ict_owner
    if department is not None:
        asset.owning_department = department
    db.add(asset)
    await db.flush()
    return asset


def apply_asset_edit(
    *,
    asset: Asset,
    updates: Mapping[str, object],
    business_owner: User | None = None,
    ict_owner: User | None = None,
    department: Department | None = None,
    downstream_vendors: Iterable[Vendor] = (),
    orphan_completions: Iterable[AssetOrphanCompletion] = (),
) -> None:
    for field, value in updates.items():
        setattr(asset, field, value)
    if business_owner is not None:
        asset.business_owner = business_owner
    if ict_owner is not None:
        asset.ict_owner = ict_owner
    if department is not None:
        asset.owning_department = department
    _advance_asset_versions((asset,), downstream_vendors)
    for completion in orphan_completions:
        orphan = completion.orphan
        orphan.status = "resolved"
        orphan.resolved_at = utc_now()
        orphan.resolved_by_id = completion.resolved_by_id
        orphan.new_owner_id = getattr(asset, f"{orphan.responsibility_role}_user_id")


def apply_asset_archive(
    *, asset: Asset, actor: User, downstream_vendors: Iterable[Vendor] = (), restore: bool = False
) -> None:
    if restore:
        asset.mark_restored(actor)
    else:
        asset.mark_archived(actor)
    _advance_asset_versions((asset,), downstream_vendors)


async def apply_asset_relationship(
    db: AsyncSession,
    *,
    relationship_type: Literal["asset", "vendor", "risk"],
    action: Literal["add", "remove"],
    values: Mapping[str, object],
    existing: AssetAssetLink | AssetVendorLink | RiskAssetLink | None = None,
    impacted_assets: Iterable[Asset] = (),
    impacted_vendors: Iterable[Vendor] = (),
) -> AssetAssetLink | AssetVendorLink | RiskAssetLink | None:
    """Apply one validated relationship and its exact captured version set.

    Direct removal of a dangling relationship may supply no impacted rows.
    Direct relationships never add Vendor counters; approved replay supplies
    its already-validated Vendor cascade explicitly. Callers own flush/audit.
    """
    link: AssetAssetLink | AssetVendorLink | RiskAssetLink | None
    if action == "add":
        if relationship_type == "asset":
            link = AssetAssetLink(**values)
        elif relationship_type == "vendor":
            link = AssetVendorLink(**values)
        else:
            link = RiskAssetLink(**values)
        db.add(link)
    else:
        assert existing is not None
        await db.delete(existing)
        link = None
    _advance_asset_versions(impacted_assets, impacted_vendors)
    return link


__all__ = [
    "AssetOrphanCompletion",
    "apply_asset_archive",
    "apply_asset_create",
    "apply_asset_edit",
    "apply_asset_relationship",
]
