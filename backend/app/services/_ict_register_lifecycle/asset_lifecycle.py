from __future__ import annotations

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import asset as audit_asset
from app.core.exceptions import ValidationError
from app.models import Asset, User
from app.models._archivable import archived_clause
from app.schemas.asset import AssetCreate, AssetListResponse, AssetRead, AssetUpdate
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import (
    assert_asset_archive_allowed,
    assert_asset_create_allowed,
    assert_asset_readable,
    assert_asset_restore_allowed,
    assert_asset_update_allowed,
)
from .asset_projection import (
    serialize_asset_detail,
    serialize_asset_detail_with_primary,
    serialize_asset_list,
)

_SORT_COLUMNS = {
    "name": Asset.name,
    "asset_type": Asset.asset_type,
    "owner_department": Asset.owner_department,
    "lifecycle_state": Asset.lifecycle_state,
    "created_at": Asset.created_at,
}


async def create_asset_detail(
    *,
    db: AsyncSession,
    payload: AssetCreate,
    current_user: User,
) -> AssetRead:
    await assert_asset_create_allowed(current_user=current_user)

    asset = Asset(**payload.model_dump())
    db.add(asset)
    await db.flush()

    await audit_asset.asset_created(db, actor=current_user, asset=asset)
    await commit_service_boundary(db, boundary="ict_register_asset_create")
    await db.refresh(asset)
    # A freshly created Asset has no Link relations, hence no primary Process.
    return serialize_asset_detail(asset, current_user=current_user, primary_process_id=None)


async def read_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    current_user: User,
) -> AssetRead:
    asset = await assert_asset_readable(db, asset_id=asset_id, current_user=current_user)
    return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)


async def update_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    payload: AssetUpdate,
    current_user: User,
) -> AssetRead:
    asset = await assert_asset_update_allowed(db, asset_id=asset_id, current_user=current_user)
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    if "name" in updates and updates["name"] is None:
        raise ValidationError("name cannot be null")
    if not updates:
        return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)

    changes = audit_asset.asset_update_changes(asset, updates)
    for field, value in updates.items():
        setattr(asset, field, value)

    await audit_asset.asset_updated(db, actor=current_user, asset=asset, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_asset_update")
    await db.refresh(asset)
    return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)


async def archive_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    current_user: User,
) -> None:
    asset = await assert_asset_archive_allowed(db, asset_id=asset_id, current_user=current_user)
    changes = audit_asset.asset_archive_changes(asset)
    asset.mark_archived(current_user)

    await audit_asset.asset_archived(db, actor=current_user, asset=asset, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_asset_archive")


async def restore_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    current_user: User,
) -> AssetRead:
    asset = await assert_asset_restore_allowed(db, asset_id=asset_id, current_user=current_user)
    changes = audit_asset.asset_restore_changes(asset)
    asset.mark_restored(current_user)

    await audit_asset.asset_restored(db, actor=current_user, asset=asset, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_asset_restore")
    await db.refresh(asset)
    return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)


async def list_asset_register(
    *,
    db: AsyncSession,
    current_user: User,
    offset: int,
    limit: int,
    search: str | None,
    include_archived: bool,
    sort_by: str | None,
    sort_order: str | None,
) -> AssetListResponse:
    query = select(Asset)
    if not include_archived:
        query = query.where(archived_clause(Asset, archived=False))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Asset.name.ilike(pattern),
                Asset.asset_type.ilike(pattern),
                Asset.business_owner.ilike(pattern),
                Asset.ict_owner.ilike(pattern),
                Asset.alternative_names.ilike(pattern),
            )
        )

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0

    if sort_by is not None and sort_by not in _SORT_COLUMNS:
        raise ValidationError("Invalid sort_by value")
    order_column = _SORT_COLUMNS[sort_by] if sort_by else Asset.id
    query = query.order_by(desc(order_column) if sort_order == "desc" else asc(order_column))

    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()
    return await serialize_asset_list(
        db,
        list(rows),
        current_user=current_user,
        total=total,
        offset=offset,
        limit=limit,
    )
