from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import check_permission
from app.models import Asset, ProcessAssetLink, User
from app.schemas.asset import AssetListCapabilities, AssetListResponse, AssetRead
from app.services._authorization_capabilities import asset_capabilities


async def load_primary_process_ids(db: AsyncSession, asset_ids: list[int]) -> dict[int, int]:
    """Map asset id -> its designated primary Process id (absent when none)."""
    if not asset_ids:
        return {}
    rows = await db.execute(
        select(ProcessAssetLink.asset_id, ProcessAssetLink.process_id).where(
            ProcessAssetLink.asset_id.in_(asset_ids),
            ProcessAssetLink.is_primary.is_(True),
        )
    )
    return {asset_id: process_id for asset_id, process_id in rows.all()}


def serialize_asset_detail(
    asset: Asset,
    *,
    current_user: User,
    primary_process_id: int | None,
) -> AssetRead:
    base = AssetRead.model_validate(asset)
    return base.model_copy(
        update={
            "capabilities": asset_capabilities(current_user, asset),
            "primary_process_id": primary_process_id,
        }
    )


async def serialize_asset_detail_with_primary(
    db: AsyncSession,
    asset: Asset,
    *,
    current_user: User,
) -> AssetRead:
    primary_map = await load_primary_process_ids(db, [asset.id])
    return serialize_asset_detail(
        asset, current_user=current_user, primary_process_id=primary_map.get(asset.id)
    )


def build_asset_collection_capabilities(current_user: User) -> AssetListCapabilities:
    return AssetListCapabilities(can_create=check_permission(current_user, "assets", "write"))


async def serialize_asset_list(
    db: AsyncSession,
    assets: list[Asset],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
) -> AssetListResponse:
    primary_map = await load_primary_process_ids(db, [asset.id for asset in assets])
    return AssetListResponse(
        items=[
            serialize_asset_detail(
                asset, current_user=current_user, primary_process_id=primary_map.get(asset.id)
            )
            for asset in assets
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_asset_collection_capabilities(current_user),
    )
