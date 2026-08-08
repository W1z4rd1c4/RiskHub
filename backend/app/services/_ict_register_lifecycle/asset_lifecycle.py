from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import asset as audit_asset
from app.core.exceptions import ValidationError
from app.models import Asset, Department, User
from app.models._archivable import archived_clause
from app.schemas.asset import AssetCreate, AssetListResponse, AssetRead, AssetUpdate
from app.services._asset_owner_lock import acquire_asset_owner_identity_locks
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import (
    assert_active_asset_department,
    assert_active_asset_owner,
    assert_asset_archive_allowed,
    assert_asset_create_allowed,
    assert_asset_ordinary_mutation_allowed,
    assert_asset_readable,
    assert_asset_restore_allowed,
    assert_asset_update_allowed,
    asset_visibility_clause,
    load_asset,
)
from .asset_projection import (
    load_asset_derived_blocks,
    serialize_asset_detail_with_primary,
    serialize_asset_list,
)
from .lifecycle_adapters import (
    apply_archive_lifecycle,
    apply_update_lifecycle,
    extract_updates,
    load_register_page,
)

_SORT_COLUMNS = {
    "name": Asset.name,
    "asset_type": Asset.asset_type,
    "owning_department": Asset.owning_department_id,
    "lifecycle_state": Asset.lifecycle_state,
    "created_at": Asset.created_at,
}

_ASSET_CRITICALITY_FILTER_CODES = {
    "Nízká": "low",
    "Střední": "medium",
    "Vysoká": "high",
    "Kritická": "critical",
}


async def create_asset_detail(
    *,
    db: AsyncSession,
    payload: AssetCreate,
    current_user: User,
) -> AssetRead:
    await assert_asset_create_allowed(current_user=current_user)

    from app.services._governed_mutations.asset_mutations import (
        acquire_asset_name_lock,
        duplicate_asset_display_name_exists,
        submit_asset_creation_if_required,
    )

    await acquire_asset_name_lock(db, asset_name=payload.name)
    await acquire_asset_owner_identity_locks(
        db,
        user_ids=(payload.business_owner_user_id, payload.ict_owner_user_id),
    )
    business_owner = await assert_active_asset_owner(
        db,
        user_id=payload.business_owner_user_id,
        acquire_identity_lock=False,
    )
    ict_owner = await assert_active_asset_owner(
        db,
        user_id=payload.ict_owner_user_id,
        acquire_identity_lock=False,
    )
    department = await assert_active_asset_department(
        db,
        department_id=payload.owning_department_id,
    )

    queued = await submit_asset_creation_if_required(
        db=db,
        payload=payload,
        current_user=current_user,
        business_owner=business_owner,
        ict_owner=ict_owner,
        department=department,
        name_lock_acquired=True,
    )
    if queued is not None:
        return queued

    # ``submit_asset_creation_if_required`` holds the rowless name lock even
    # when policy allows direct application. Recheck under that lock so a
    # concurrent approval resolution cannot create a duplicate display name.
    if await duplicate_asset_display_name_exists(db, asset_name=payload.name):
        raise ValidationError("An Asset with this name already exists")

    asset = Asset(**payload.model_dump(exclude={"request_reason"}))
    asset.business_owner = business_owner
    asset.ict_owner = ict_owner
    asset.owning_department = department
    db.add(asset)
    await db.flush()

    await audit_asset.asset_created(db, actor=current_user, asset=asset)
    await commit_service_boundary(db, boundary="ict_register_asset_create")
    reloaded = await load_asset(db, asset.id)
    assert reloaded is not None
    # A freshly created Asset has no Link relations yet; the derived block
    # still rides the payload with its empty-links shape (compute-on-read).
    return await serialize_asset_detail_with_primary(db, reloaded, current_user=current_user)


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
    updates = extract_updates(
        payload,
        non_nullable_fields=(
            "name",
            "business_owner_user_id",
            "ict_owner_user_id",
            "owning_department_id",
        ),
    )
    if not updates:
        return await serialize_asset_detail_with_primary(db, asset, current_user=current_user)

    updates.pop("request_reason", None)
    updates = {
        field: value
        for field, value in updates.items()
        if getattr(asset, field) != value
    }
    if not updates:
        return await serialize_asset_detail_with_primary(
            db,
            asset,
            current_user=current_user,
        )

    from app.services._governed_mutations.asset_mutations import (
        acquire_asset_name_lock,
        duplicate_asset_display_name_exists,
    )

    if "name" in updates:
        # A rename shares the asset name lock so a concurrent creation or
        # governed resolution cannot land the same display name.
        await acquire_asset_name_lock(db, asset_name=updates["name"])

    proposed_business_owner_id = (
        int(updates["business_owner_user_id"]) if "business_owner_user_id" in updates else asset.business_owner_user_id
    )
    proposed_ict_owner_id = (
        int(updates["ict_owner_user_id"]) if "ict_owner_user_id" in updates else asset.ict_owner_user_id
    )
    asset = await assert_asset_ordinary_mutation_allowed(
        db,
        asset_id=asset_id,
        current_user=current_user,
        additional_owner_user_ids=(
            proposed_business_owner_id,
            proposed_ict_owner_id,
        ),
    )

    from app.services._governed_mutations.asset_mutations import (
        submit_asset_edit_if_required,
    )

    queued = await submit_asset_edit_if_required(
        db=db,
        asset=asset,
        payload=payload,
        current_user=current_user,
        updates=updates,
    )
    if queued is not None:
        return queued

    # The rename holds the asset name lock even when policy allows
    # direct application. Recheck under that lock, excluding the Asset itself,
    # so a concurrent creation cannot land a duplicate display name.
    if "name" in updates and await duplicate_asset_display_name_exists(
        db,
        asset_name=updates["name"],
        exclude_asset_id=asset.id,
    ):
        raise ValidationError("An Asset with this name already exists")

    if "business_owner_user_id" in updates:
        asset.business_owner = await assert_active_asset_owner(
            db,
            user_id=int(updates["business_owner_user_id"]),
            acquire_identity_lock=False,
        )
    if "ict_owner_user_id" in updates:
        asset.ict_owner = await assert_active_asset_owner(
            db,
            user_id=int(updates["ict_owner_user_id"]),
            acquire_identity_lock=False,
        )
    if "owning_department_id" in updates:
        asset.owning_department = await assert_active_asset_department(
            db,
            department_id=int(updates["owning_department_id"]),
        )

    asset.governance_version += 1
    await apply_update_lifecycle(
        db=db,
        entity=asset,
        updates=updates,
        changes_factory=audit_asset.asset_update_changes,
        audit=lambda changes: audit_asset.asset_updated(db, actor=current_user, asset=asset, changes=changes),
        boundary="ict_register_asset_update",
    )
    refreshed = await load_asset(db, asset.id)
    assert refreshed is not None
    return await serialize_asset_detail_with_primary(db, refreshed, current_user=current_user)


async def archive_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    current_user: User,
    request_reason: str | None = None,
) -> None:
    asset = await assert_asset_archive_allowed(db, asset_id=asset_id, current_user=current_user)
    from app.services._governed_mutations.asset_mutations import (
        submit_asset_archive_if_required,
    )

    queued = await submit_asset_archive_if_required(
        db=db,
        asset=asset,
        current_user=current_user,
        request_reason=request_reason,
    )
    if queued is not None:
        return queued
    asset.governance_version += 1
    await apply_archive_lifecycle(
        db=db,
        entity=asset,
        current_user=current_user,
        changes_factory=audit_asset.asset_archive_changes,
        audit=lambda changes: audit_asset.asset_archived(db, actor=current_user, asset=asset, changes=changes),
        boundary="ict_register_asset_archive",
    )


async def restore_asset_detail(
    *,
    db: AsyncSession,
    asset_id: int,
    current_user: User,
) -> AssetRead:
    asset = await assert_asset_restore_allowed(db, asset_id=asset_id, current_user=current_user)
    asset.governance_version += 1
    await apply_archive_lifecycle(
        db=db,
        entity=asset,
        current_user=current_user,
        changes_factory=audit_asset.asset_restore_changes,
        audit=lambda changes: audit_asset.asset_restored(db, actor=current_user, asset=asset, changes=changes),
        boundary="ict_register_asset_restore",
        restore=True,
        refresh=True,
    )
    restored = await load_asset(db, asset.id)
    assert restored is not None
    return await serialize_asset_detail_with_primary(db, restored, current_user=current_user)


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
    query = select(Asset).options(
        selectinload(Asset.business_owner).selectinload(User.role),
        selectinload(Asset.business_owner).selectinload(User.department),
        selectinload(Asset.ict_owner).selectinload(User.role),
        selectinload(Asset.ict_owner).selectinload(User.department),
        selectinload(Asset.owning_department),
    )
    visibility_clause = asset_visibility_clause(current_user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    if not include_archived:
        query = query.where(archived_clause(Asset, archived=False))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Asset.name.ilike(pattern),
                Asset.asset_type.ilike(pattern),
                Asset.business_owner.has(User.name.ilike(pattern)),
                Asset.ict_owner.has(User.name.ilike(pattern)),
                Asset.owning_department.has(Department.name.ilike(pattern)),
                Asset.alternative_names.ilike(pattern),
            )
        )

    if has_process_link is not None or criticality is not None:
        candidates = list((await db.execute(query.order_by(Asset.id))).scalars().all())
        derived_by_asset_id = await load_asset_derived_blocks(
            db,
            candidates,
            current_user=current_user,
        )
        criticality_filter = (
            _ASSET_CRITICALITY_FILTER_CODES.get(criticality, criticality) if criticality is not None else None
        )
        eligible_ids = []
        for asset in candidates:
            derived = derived_by_asset_id[asset.id]
            if has_process_link is not None and ((derived.linked_process_count > 0) is not has_process_link):
                continue
            if criticality_filter is not None and derived.resulting_criticality != criticality_filter:
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
