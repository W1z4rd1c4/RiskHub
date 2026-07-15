from __future__ import annotations

from collections.abc import Iterable
from typing import Final

from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models import Asset

_ASSET_OWNER_LOCK_NAMESPACE = 0x5241
_OWNERS_NOT_CHECKED: Final = object()


async def acquire_asset_owner_identity_locks(
    db: AsyncSession,
    *,
    user_ids: Iterable[int | None],
) -> None:
    """Serialize Asset responsibility assignment and identity deactivation."""
    if db.get_bind().dialect.name != "postgresql":
        return

    for user_id in sorted(user_id for user_id in set(user_ids) if user_id is not None):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :user_id)"),
            {"namespace": _ASSET_OWNER_LOCK_NAMESPACE, "user_id": user_id},
        )


async def acquire_asset_owner_identity_lock(
    db: AsyncSession,
    *,
    user_id: int,
) -> None:
    await acquire_asset_owner_identity_locks(db, user_ids=(user_id,))


async def lock_asset_for_owner_mutation(
    db: AsyncSession,
    *,
    asset_id: int,
    user_ids: Iterable[int | None],
    expected_owner_user_ids: tuple[int | None, int | None] | object = _OWNERS_NOT_CHECKED,
) -> Asset | None:
    """Acquire the identity -> Asset-row responsibility lock order."""
    await acquire_asset_owner_identity_locks(db, user_ids=user_ids)
    asset = (
        await db.execute(
            select(Asset)
            .where(Asset.id == asset_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if (
        asset is not None
        and expected_owner_user_ids is not _OWNERS_NOT_CHECKED
        and (
            asset.business_owner_user_id,
            asset.ict_owner_user_id,
        )
        != expected_owner_user_ids
    ):
        raise ConflictError("Asset responsibilities changed concurrently; retry")
    return asset


async def lock_assets_for_owner_deactivation(
    db: AsyncSession,
    *,
    user_id: int,
) -> list[Asset]:
    """Lock every Asset responsibility held by a deactivating identity."""
    await acquire_asset_owner_identity_lock(db, user_id=user_id)
    return list(
        (
            await db.execute(
                select(Asset)
                .where(
                    or_(
                        Asset.business_owner_user_id == user_id,
                        Asset.ict_owner_user_id == user_id,
                    )
                )
                .order_by(Asset.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
