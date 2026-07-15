from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import asset as audit_asset
from app.models import Asset, User
from app.models._archivable import archived_clause
from app.schemas.asset import AssetCreate, AssetListResponse, AssetRead, AssetUpdate
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import (
    assert_asset_archive_allowed,
    assert_asset_create_allowed,
    assert_asset_readable,
    assert_asset_restore_allowed,
    assert_asset_update_allowed,
)
from .asset_projection import serialize_asset_detail_with_primary, serialize_asset_list
from .derivation import derive_ict_register
from .derivation_inputs import load_ict_register_graph
from .lifecycle_adapters import (
    apply_archive_lifecycle,
    apply_update_lifecycle,
    extract_updates,
    load_register_page,
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
    # A freshly created Asset has no Link relations yet; the derived block
    # still rides the payload with its empty-links shape (compute-on-read).
    return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)


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
    updates = extract_updates(payload, non_nullable_fields=("name",))
    if not updates:
        return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)

    await apply_update_lifecycle(
        db=db,
        entity=asset,
        updates=updates,
        changes_factory=audit_asset.asset_update_changes,
        audit=lambda changes: audit_asset.asset_updated(
            db, actor=current_user, asset=asset, changes=changes
        ),
        boundary="ict_register_asset_update",
    )
    return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)


async def archive_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    current_user: User,
) -> None:
    asset = await assert_asset_archive_allowed(db, asset_id=asset_id, current_user=current_user)
    await apply_archive_lifecycle(
        db=db,
        entity=asset,
        current_user=current_user,
        changes_factory=audit_asset.asset_archive_changes,
        audit=lambda changes: audit_asset.asset_archived(
            db, actor=current_user, asset=asset, changes=changes
        ),
        boundary="ict_register_asset_archive",
    )


async def restore_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    current_user: User,
) -> AssetRead:
    asset = await assert_asset_restore_allowed(db, asset_id=asset_id, current_user=current_user)
    await apply_archive_lifecycle(
        db=db,
        entity=asset,
        current_user=current_user,
        changes_factory=audit_asset.asset_restore_changes,
        audit=lambda changes: audit_asset.asset_restored(
            db, actor=current_user, asset=asset, changes=changes
        ),
        boundary="ict_register_asset_restore",
        restore=True,
        refresh=True,
    )
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
    has_process_link: bool | None = None,
    criticality: str | None = None,
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

    if has_process_link is not None or criticality is not None:
        candidates = list((await db.execute(query.order_by(Asset.id))).scalars().all())
        parameters = await load_ict_workbook_parameter_set(db)
        graph = await load_ict_register_graph(db, assets=candidates)
        derivation = derive_ict_register(graph, parameters)
        eligible_ids = []
        for asset in candidates:
            derived = derivation.assets[asset.id]
            if (
                has_process_link is not None
                and ((derived.linked_process_count > 0) is not has_process_link)
            ):
                continue
            if criticality is not None and derived.resulting_criticality != criticality:
                continue
            eligible_ids.append(asset.id)
        query = query.where(Asset.id.in_(eligible_ids))

    rows, total = await load_register_page(
        db=db,
        query=query,
        model=Asset,
        offset=offset,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
        sort_columns=_SORT_COLUMNS,
    )
    return await serialize_asset_list(
        db,
        list(rows),
        current_user=current_user,
        total=total,
        offset=offset,
        limit=limit,
    )
