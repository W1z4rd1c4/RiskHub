from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.security import check_permission
from app.models import Asset, User


async def load_asset(db: AsyncSession, asset_id: int) -> Asset | None:
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    return result.scalar_one_or_none()


async def assert_asset_readable(db: AsyncSession, *, asset_id: int, current_user: User) -> Asset:
    if not check_permission(current_user, "assets", "read"):
        raise AuthorizationError("Permission denied: assets:read")
    asset = await load_asset(db, asset_id)
    if not asset:
        raise NotFoundError("Asset not found")
    return asset


async def assert_asset_create_allowed(*, current_user: User) -> None:
    if not check_permission(current_user, "assets", "write"):
        raise AuthorizationError("Permission denied: assets:write")


async def assert_asset_update_allowed(db: AsyncSession, *, asset_id: int, current_user: User) -> Asset:
    if not check_permission(current_user, "assets", "write"):
        raise AuthorizationError("Permission denied: assets:write")
    asset = await load_asset(db, asset_id)
    if not asset:
        raise NotFoundError("Asset not found")
    if asset.is_archived:
        raise ConflictError("Cannot update archived asset")
    return asset


async def _assert_asset_delete_allowed(db: AsyncSession, *, asset_id: int, current_user: User) -> Asset:
    if not check_permission(current_user, "assets", "delete"):
        raise AuthorizationError("Permission denied: assets:delete")
    asset = await load_asset(db, asset_id)
    if not asset:
        raise NotFoundError("Asset not found")
    return asset


async def assert_asset_archive_allowed(db: AsyncSession, *, asset_id: int, current_user: User) -> Asset:
    asset = await _assert_asset_delete_allowed(db, asset_id=asset_id, current_user=current_user)
    if asset.is_archived:
        raise ValidationError("Asset is already archived")
    return asset


async def assert_asset_restore_allowed(db: AsyncSession, *, asset_id: int, current_user: User) -> Asset:
    asset = await _assert_asset_delete_allowed(db, asset_id=asset_id, current_user=current_user)
    if not asset.is_archived:
        raise ValidationError("Asset is not archived")
    return asset
