from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import and_, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import get_user_department_ids, has_permission
from app.core.security import check_permission
from app.models import Asset, Department, OrphanedItem, User
from app.models.role import RoleType
from app.services._asset_owner_lock import (
    acquire_asset_owner_identity_lock,
    lock_asset_for_owner_mutation,
)


async def load_asset(db: AsyncSession, asset_id: int) -> Asset | None:
    return (
        await db.execute(
            select(Asset)
            .options(
                selectinload(Asset.business_owner).selectinload(User.role),
                selectinload(Asset.business_owner).selectinload(User.department),
                selectinload(Asset.ict_owner).selectinload(User.role),
                selectinload(Asset.ict_owner).selectinload(User.department),
                selectinload(Asset.owning_department),
            )
            .where(Asset.id == asset_id)
        )
    ).scalar_one_or_none()


def _is_owning_department_head(current_user: User, asset: Asset) -> bool:
    role_name = current_user.role.name if current_user.role is not None else None
    return bool(
        role_name == RoleType.DEPARTMENT_HEAD
        and asset.owning_department_id is not None
        and asset.owning_department_id == current_user.department_id
        and asset.owning_department is not None
        and asset.owning_department.is_active
    )


def can_read_asset_record(current_user: User, asset: Asset) -> bool:
    if current_user.id in {
        asset.business_owner_user_id,
        asset.ict_owner_user_id,
    }:
        return True
    role_name = current_user.role.name if current_user.role is not None else None
    if role_name == RoleType.DEPARTMENT_HEAD:
        return _is_owning_department_head(current_user, asset)
    if not has_permission(current_user, "assets", "read"):
        return False
    department_ids = get_user_department_ids(current_user)
    return department_ids is None or asset.owning_department_id in department_ids


def can_update_asset_record(current_user: User, asset: Asset) -> bool:
    if asset.is_archived or not can_read_asset_record(current_user, asset):
        return False
    return bool(
        has_permission(current_user, "assets", "write")
        or current_user.id
        in {asset.business_owner_user_id, asset.ict_owner_user_id}
        or _is_owning_department_head(current_user, asset)
    )


def asset_visibility_clause(current_user: User):
    owner_clause = or_(
        Asset.business_owner_user_id == current_user.id,
        Asset.ict_owner_user_id == current_user.id,
    )
    role_name = current_user.role.name if current_user.role is not None else None
    active_department_clause = Asset.owning_department.has(
        Department.is_active.is_(True)
    )
    if role_name == RoleType.DEPARTMENT_HEAD:
        department_head_clause = (
            and_(
                Asset.owning_department_id == current_user.department_id,
                active_department_clause,
            )
            if current_user.department_id is not None
            else None
        )
        return (
            or_(owner_clause, department_head_clause)
            if department_head_clause is not None
            else owner_clause
        )
    if not has_permission(current_user, "assets", "read"):
        return owner_clause
    department_ids = get_user_department_ids(current_user)
    if department_ids is None:
        return None
    if not department_ids:
        return owner_clause
    clauses = [owner_clause, Asset.owning_department_id.in_(department_ids)]
    return or_(*clauses)


def editable_asset_visibility_clause(current_user: User):
    owner_clause = or_(
        Asset.business_owner_user_id == current_user.id,
        Asset.ict_owner_user_id == current_user.id,
    )
    editable_clauses = [owner_clause]
    can_read = has_permission(current_user, "assets", "read")
    has_global_write = False
    if can_read and has_permission(current_user, "assets", "write"):
        readable_clause = asset_visibility_clause(current_user)
        if readable_clause is None:
            has_global_write = True
        else:
            editable_clauses.append(readable_clause)

    role_name = current_user.role.name if current_user.role is not None else None
    if (
        role_name == RoleType.DEPARTMENT_HEAD
        and current_user.department_id is not None
    ):
        editable_clauses.append(
            and_(
                Asset.owning_department_id == current_user.department_id,
                Asset.owning_department.has(Department.is_active.is_(True)),
            )
        )

    pending_orphan_exists = (
        select(OrphanedItem.id)
        .where(
            OrphanedItem.item_type == "asset",
            OrphanedItem.item_id == Asset.id,
            OrphanedItem.status == "pending",
        )
        .exists()
    )
    return and_(
        Asset.is_archived.is_(False),
        true() if has_global_write else or_(*editable_clauses),
        ~pending_orphan_exists,
    )


async def has_editable_asset_record(
    db: AsyncSession,
    *,
    current_user: User,
) -> bool:
    """Return only an existence fact; never project an unreadable Asset row."""
    asset_id = await db.scalar(
        select(Asset.id)
        .where(editable_asset_visibility_clause(current_user))
        .limit(1)
    )
    return asset_id is not None


async def assert_asset_assignment_lookup_allowed(
    db: AsyncSession,
    *,
    current_user: User,
) -> None:
    if has_permission(current_user, "assets", "write"):
        return
    editable_id = await db.scalar(
        select(Asset.id).where(editable_asset_visibility_clause(current_user)).limit(1)
    )
    if editable_id is None:
        raise AuthorizationError("Permission denied: Asset assignment lookup")


async def assert_active_asset_owner(
    db: AsyncSession,
    *,
    user_id: int,
    acquire_identity_lock: bool = True,
) -> User:
    if acquire_identity_lock:
        await acquire_asset_owner_identity_lock(db, user_id=user_id)
    owner = (
        await db.execute(
            select(User)
            .options(selectinload(User.role), selectinload(User.department))
            .where(User.id == user_id, User.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if owner is None:
        raise ValidationError("Asset owner must be an active user")
    return owner


async def assert_active_asset_department(
    db: AsyncSession,
    *,
    department_id: int,
) -> Department:
    department = (
        await db.execute(
            select(Department)
            .where(Department.id == department_id, Department.is_active.is_(True))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if department is None:
        raise ValidationError("Owning department must be active")
    return department


async def assert_asset_readable(db: AsyncSession, *, asset_id: int, current_user: User) -> Asset:
    asset = await load_asset(db, asset_id)
    if asset is None or not can_read_asset_record(current_user, asset):
        raise NotFoundError("Asset not found")
    return asset


async def assert_asset_create_allowed(*, current_user: User) -> None:
    if not check_permission(current_user, "assets", "write"):
        raise AuthorizationError("Permission denied: assets:write")


async def assert_asset_update_allowed(db: AsyncSession, *, asset_id: int, current_user: User) -> Asset:
    asset = await assert_asset_readable(db, asset_id=asset_id, current_user=current_user)
    if asset.is_archived:
        raise ConflictError("Cannot update archived asset")
    if not can_update_asset_record(current_user, asset):
        raise AuthorizationError("Permission denied: assets:write")
    return asset


async def assert_asset_ordinary_mutation_allowed(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
    additional_owner_user_ids: Iterable[int | None] = (),
) -> Asset:
    asset = await assert_asset_update_allowed(
        db,
        asset_id=asset_id,
        current_user=current_user,
    )
    expected_owner_ids = (
        asset.business_owner_user_id,
        asset.ict_owner_user_id,
    )
    asset = await lock_asset_for_owner_mutation(
        db,
        asset_id=asset.id,
        user_ids=(*expected_owner_ids, *additional_owner_user_ids),
        expected_owner_user_ids=expected_owner_ids,
    )
    if asset is None:
        raise NotFoundError("Asset not found")
    if asset.is_archived:
        raise ConflictError("Cannot update archived asset")
    if not can_update_asset_record(current_user, asset):
        raise AuthorizationError("Permission denied: assets:write")

    pending_orphan_id = await db.scalar(
        select(OrphanedItem.id)
        .where(
            OrphanedItem.item_type == "asset",
            OrphanedItem.item_id == asset.id,
            OrphanedItem.status == "pending",
        )
        .limit(1)
    )
    if pending_orphan_id is not None:
        raise ConflictError(
            "Orphaned Asset responsibility must be reassigned through the governance workflow"
        )
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
