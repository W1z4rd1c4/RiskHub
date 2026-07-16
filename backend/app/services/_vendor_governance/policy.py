from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission
from app.models import OrphanedItem, User, Vendor
from app.services._vendor_owner_lock import lock_vendor_for_owner_mutation
from app.services._vendor_workflow import load_vendor_for_update, validate_vendor_governance_assignment


async def load_vendor_with_deps(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(
        select(Vendor)
        .options(
            selectinload(Vendor.department),
            selectinload(Vendor.outsourcing_owner).selectinload(User.role),
            selectinload(Vendor.outsourcing_owner).selectinload(User.department),
        )
        .where(Vendor.id == vendor_id)
    )
    return result.scalar_one_or_none()


async def assert_vendor_readable(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    vendor = await load_vendor_with_deps(db, vendor_id)
    if not vendor or not (
        is_vendor_owner(vendor, current_user)
        or (
            check_permission(current_user, "vendors", "read")
            and can_read_vendor(vendor, current_user)
        )
    ):
        raise NotFoundError("Vendor not found")
    return vendor


async def assert_vendor_assignment_lookup_allowed(
    db: AsyncSession,
    *,
    current_user: User,
) -> None:
    del db  # The permission itself is authoritative; assignment is validated on write.
    if not check_permission(current_user, "vendors", "write"):
        raise AuthorizationError("Permission denied: Vendor assignment lookup")


async def assert_vendor_list_allowed(
    db: AsyncSession,
    *,
    current_user: User,
) -> None:
    if check_permission(current_user, "vendors", "read"):
        return
    owned_vendor_id = await db.scalar(
        select(Vendor.id)
        .where(Vendor.outsourcing_owner_user_id == current_user.id)
        .limit(1)
    )
    if owned_vendor_id is None:
        raise AuthorizationError("Permission denied: vendors:read")


def assert_vendor_export_allowed(*, current_user: User) -> None:
    """Require both register-read and report-read authority for standard export."""
    if not (
        check_permission(current_user, "vendors", "read")
        and check_permission(current_user, "reports", "read")
    ):
        raise AuthorizationError("Permission denied: Vendor standard export")


async def assert_vendor_update_allowed(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> Vendor:
    vendor = await assert_vendor_readable(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
    )
    if vendor.is_archived:
        raise ConflictError("Cannot update archived vendor")

    can_write_visible = bool(
        check_permission(current_user, "vendors", "write")
        and can_read_vendor(vendor, current_user)
    )
    if not can_write_visible and not is_vendor_owner(vendor, current_user):
        raise AuthorizationError("Permission denied: vendors:write")
    return vendor


async def lock_vendor_ordinary_mutation(
    db: AsyncSession,
    *,
    vendor_id: int,
    additional_owner_user_ids: Iterable[int | None] = (),
) -> Vendor:
    """Lock accountability state and reject ordinary mutation while orphaned."""
    expected_owner_id = await db.scalar(
        select(Vendor.outsourcing_owner_user_id).where(Vendor.id == vendor_id)
    )
    if expected_owner_id is None:
        raise NotFoundError("Vendor not found")
    vendor = await lock_vendor_for_owner_mutation(
        db,
        vendor_id=vendor_id,
        user_ids=(expected_owner_id, *additional_owner_user_ids),
        expected_owner_user_id=expected_owner_id,
    )
    if vendor is None:
        raise NotFoundError("Vendor not found")
    pending_orphan_id = await db.scalar(
        select(OrphanedItem.id)
        .where(
            OrphanedItem.item_type == "vendor",
            OrphanedItem.item_id == vendor.id,
            OrphanedItem.status == "pending",
        )
        .limit(1)
    )
    if pending_orphan_id is not None:
        raise ConflictError(
            "Vendor Outsourcing Owner is pending Governance reassignment"
        )
    return vendor


async def assert_vendor_ordinary_mutation_allowed(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
    additional_owner_user_ids: Iterable[int | None] = (),
) -> Vendor:
    await assert_vendor_update_allowed(
        db,
        vendor_id=vendor_id,
        current_user=current_user,
    )
    vendor = await lock_vendor_ordinary_mutation(
        db,
        vendor_id=vendor_id,
        additional_owner_user_ids=additional_owner_user_ids,
    )
    if vendor.is_archived:
        raise ConflictError("Cannot update archived vendor")
    can_write_visible = bool(
        check_permission(current_user, "vendors", "write")
        and can_read_vendor(vendor, current_user)
    )
    if not can_write_visible and not is_vendor_owner(vendor, current_user):
        raise AuthorizationError("Permission denied: vendors:write")
    return vendor


async def assert_vendor_governance_update_allowed(
    db: AsyncSession,
    *,
    current_user: User,
    vendor: Vendor,
    updates: dict,
) -> None:
    can_write = check_permission(current_user, "vendors", "write")
    restricted_fields = {"department_id", "outsourcing_owner_user_id", "status"}
    if not can_write and (restricted_fields & set(updates.keys())):
        raise AuthorizationError("Insufficient permissions to change governance fields")

    next_department_id = updates.get("department_id", vendor.department_id)
    next_owner_user_id = updates.get("outsourcing_owner_user_id", vendor.outsourcing_owner_user_id)
    if can_write and ({"department_id", "outsourcing_owner_user_id"} & set(updates.keys())):
        await validate_vendor_governance_assignment(
            db,
            current_user=current_user,
            department_id=next_department_id,
            owner_user_id=next_owner_user_id,
            acquire_identity_lock=False,
        )


async def assert_vendor_create_allowed(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
    owner_user_id: int,
) -> None:
    await validate_vendor_governance_assignment(
        db,
        current_user=current_user,
        department_id=department_id,
        owner_user_id=owner_user_id,
    )


async def assert_vendor_delete_allowed(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    if not (
        check_permission(current_user, "vendors", "read")
        and check_permission(current_user, "vendors", "delete")
    ):
        raise AuthorizationError("Permission denied: vendors:delete")

    vendor = await load_vendor_for_update(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")
    return vendor


async def assert_vendor_archive_allowed(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    vendor = await assert_vendor_delete_allowed(db, vendor_id=vendor_id, current_user=current_user)
    if vendor.is_archived:
        raise ValidationError("Vendor is already archived")
    return vendor


async def assert_vendor_restore_allowed(db: AsyncSession, *, vendor_id: int, current_user: User) -> Vendor:
    vendor = await assert_vendor_delete_allowed(db, vendor_id=vendor_id, current_user=current_user)
    if not vendor.is_archived:
        raise ValidationError("Vendor is not archived")
    return vendor
