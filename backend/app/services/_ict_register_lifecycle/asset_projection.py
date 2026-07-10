from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import check_permission
from app.models import Asset, ProcessAssetLink, User
from app.schemas.asset import AssetDerived, AssetListCapabilities, AssetListResponse, AssetRead
from app.services._authorization_capabilities import asset_capabilities
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set

from .derivation import derive_ict_register
from .derivation_inputs import load_ict_register_graph


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


async def load_asset_derived_blocks(db: AsyncSession, assets: list[Asset]) -> dict[int, AssetDerived]:
    """Compute the engine-derived block for each Asset (compute-on-read)."""
    if not assets:
        return {}
    parameters = await load_ict_workbook_parameter_set(db)
    graph = await load_ict_register_graph(db, assets=assets)
    derivation = derive_ict_register(graph, parameters)
    return {asset.id: AssetDerived.model_validate(derivation.assets[asset.id]) for asset in assets}


def serialize_asset_detail(
    asset: Asset,
    *,
    current_user: User,
    primary_process_id: int | None,
    derived: AssetDerived | None = None,
) -> AssetRead:
    base = AssetRead.model_validate(asset)
    return base.model_copy(
        update={
            "capabilities": asset_capabilities(current_user, asset),
            "primary_process_id": primary_process_id,
            "derived": derived,
        }
    )


async def serialize_asset_detail_with_primary(
    db: AsyncSession,
    asset: Asset,
    *,
    current_user: User,
) -> AssetRead:
    primary_map = await load_primary_process_ids(db, [asset.id])
    blocks = await load_asset_derived_blocks(db, [asset])
    return serialize_asset_detail(
        asset,
        current_user=current_user,
        primary_process_id=primary_map.get(asset.id),
        derived=blocks[asset.id],
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
    blocks = await load_asset_derived_blocks(db, assets)
    return AssetListResponse(
        items=[
            serialize_asset_detail(
                asset,
                current_user=current_user,
                primary_process_id=primary_map.get(asset.id),
                derived=blocks.get(asset.id),
            )
            for asset in assets
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_asset_collection_capabilities(current_user),
    )
