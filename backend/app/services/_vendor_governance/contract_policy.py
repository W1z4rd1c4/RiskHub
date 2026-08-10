from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.models import User, Vendor, VendorContract
from app.services._vendor_governance.policy import lock_vendor_ordinary_mutation


async def load_contract_vendor(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


async def assert_contract_vendor_readable(
    db: AsyncSession, *, vendor_id: int, current_user: User
) -> Vendor:
    """Contracts live inside the Vendor domain: visibility follows the Vendor row."""
    vendor = await load_contract_vendor(db, vendor_id)
    if not (
        vendor
        and check_permission(current_user, "vendors", "read")
        and can_read_vendor(vendor, current_user)
    ):
        raise NotFoundError("Vendor not found")
    return vendor


async def assert_contract_mutation_vendor(
    db: AsyncSession, *, vendor_id: int, current_user: User
) -> Vendor:
    """Mutations require an ACTIVE parent Vendor (strict archived-end stance)."""
    vendor = await assert_contract_vendor_readable(db, vendor_id=vendor_id, current_user=current_user)
    vendor = await lock_vendor_ordinary_mutation(db, vendor_id=vendor.id)
    if vendor.is_archived:
        raise ConflictError("Cannot modify contracts of an archived vendor")
    return vendor


async def load_vendor_contract(
    db: AsyncSession, *, vendor_id: int, contract_id: int
) -> VendorContract | None:
    result = await db.execute(
        select(VendorContract).where(
            VendorContract.id == contract_id, VendorContract.vendor_id == vendor_id
        )
    )
    return result.scalar_one_or_none()


async def assert_contract_present(
    db: AsyncSession, *, vendor_id: int, contract_id: int
) -> VendorContract:
    contract = await load_vendor_contract(db, vendor_id=vendor_id, contract_id=contract_id)
    if not contract:
        raise NotFoundError("Contract not found")
    return contract


async def assert_contract_update_allowed(
    db: AsyncSession, *, vendor_id: int, contract_id: int, current_user: User
) -> VendorContract:
    await assert_contract_mutation_vendor(db, vendor_id=vendor_id, current_user=current_user)
    contract = await assert_contract_present(db, vendor_id=vendor_id, contract_id=contract_id)
    if contract.is_archived:
        raise ConflictError("Cannot update archived contract")
    return contract


async def assert_contract_archive_allowed(
    db: AsyncSession, *, vendor_id: int, contract_id: int, current_user: User
) -> VendorContract:
    await assert_contract_mutation_vendor(db, vendor_id=vendor_id, current_user=current_user)
    contract = await assert_contract_present(db, vendor_id=vendor_id, contract_id=contract_id)
    if contract.is_archived:
        raise ValidationError("Contract is already archived")
    return contract


async def assert_contract_restore_allowed(
    db: AsyncSession, *, vendor_id: int, contract_id: int, current_user: User
) -> VendorContract:
    await assert_contract_mutation_vendor(db, vendor_id=vendor_id, current_user=current_user)
    contract = await assert_contract_present(db, vendor_id=vendor_id, contract_id=contract_id)
    if not contract.is_archived:
        raise ValidationError("Contract is not archived")
    return contract
