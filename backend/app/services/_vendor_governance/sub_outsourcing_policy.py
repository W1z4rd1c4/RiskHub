from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.models import User, Vendor, VendorContract, VendorSubOutsourcing
from app.services._vendor_governance.policy import lock_vendor_ordinary_mutation

_SUB_OUTSOURCING_LOCK_NAMESPACE = 0x5248


async def acquire_sub_outsourcing_chain_lock(db: AsyncSession, *, vendor_id: int) -> None:
    """Serialize chain mutations for one Vendor until commit or rollback.

    PostgreSQL transaction-scoped advisory locks close the gap between reading
    the predecessor graph and committing its mutation. SQLite has no matching
    primitive and remains an intentional no-op for the default unit-test mode.
    Canonical order: callers must already hold the Vendor row lock (see
    sub_outsourcing_lifecycle and vendor_resolution) or they can deadlock.
    """
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:namespace, :vendor_id)"),
        {"namespace": _SUB_OUTSOURCING_LOCK_NAMESPACE, "vendor_id": vendor_id},
    )


async def load_sub_outsourcing_vendor(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


async def assert_sub_outsourcing_vendor_readable(
    db: AsyncSession, *, vendor_id: int, current_user: User
) -> Vendor:
    """Sub-outsourcing lives inside the Vendor domain: visibility follows the Vendor row."""
    vendor = await load_sub_outsourcing_vendor(db, vendor_id)
    if not (
        vendor
        and check_permission(current_user, "vendors", "read")
        and can_read_vendor(vendor, current_user)
    ):
        raise NotFoundError("Vendor not found")
    return vendor


async def assert_sub_outsourcing_mutation_vendor(
    db: AsyncSession, *, vendor_id: int, current_user: User
) -> Vendor:
    """Mutations require an ACTIVE parent Vendor (strict archived-end stance)."""
    vendor = await assert_sub_outsourcing_vendor_readable(
        db, vendor_id=vendor_id, current_user=current_user
    )
    vendor = await lock_vendor_ordinary_mutation(db, vendor_id=vendor.id)
    if vendor.is_archived:
        raise ConflictError("Cannot modify sub-outsourcing of an archived vendor")
    return vendor


async def load_vendor_sub_outsourcing(
    db: AsyncSession, *, vendor_id: int, entry_id: int
) -> VendorSubOutsourcing | None:
    result = await db.execute(
        select(VendorSubOutsourcing).where(
            VendorSubOutsourcing.id == entry_id, VendorSubOutsourcing.vendor_id == vendor_id
        )
    )
    return result.scalar_one_or_none()


async def assert_sub_outsourcing_present(
    db: AsyncSession, *, vendor_id: int, entry_id: int
) -> VendorSubOutsourcing:
    entry = await load_vendor_sub_outsourcing(db, vendor_id=vendor_id, entry_id=entry_id)
    if not entry:
        raise NotFoundError("Sub-outsourcing entry not found")
    return entry


async def assert_sub_outsourcing_update_allowed(
    db: AsyncSession, *, vendor_id: int, entry_id: int, current_user: User
) -> VendorSubOutsourcing:
    await assert_sub_outsourcing_mutation_vendor(db, vendor_id=vendor_id, current_user=current_user)
    entry = await assert_sub_outsourcing_present(db, vendor_id=vendor_id, entry_id=entry_id)
    if entry.is_archived:
        raise ConflictError("Cannot update archived sub-outsourcing entry")
    return entry


async def assert_sub_outsourcing_archive_allowed(
    db: AsyncSession, *, vendor_id: int, entry_id: int, current_user: User
) -> VendorSubOutsourcing:
    await assert_sub_outsourcing_mutation_vendor(db, vendor_id=vendor_id, current_user=current_user)
    entry = await assert_sub_outsourcing_present(db, vendor_id=vendor_id, entry_id=entry_id)
    if entry.is_archived:
        raise ValidationError("Sub-outsourcing entry is already archived")
    return entry


async def assert_sub_outsourcing_restore_allowed(
    db: AsyncSession, *, vendor_id: int, entry_id: int, current_user: User
) -> VendorSubOutsourcing:
    await assert_sub_outsourcing_mutation_vendor(db, vendor_id=vendor_id, current_user=current_user)
    entry = await assert_sub_outsourcing_present(db, vendor_id=vendor_id, entry_id=entry_id)
    if not entry.is_archived:
        raise ValidationError("Sub-outsourcing entry is not archived")
    return entry


async def assert_chain_contract(
    db: AsyncSession, *, vendor_id: int, contract_id: int
) -> VendorContract:
    """Every chain hangs off a Contract of THIS Vendor (write-time integrity, 422)."""
    result = await db.execute(select(VendorContract).where(VendorContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if contract is None or contract.vendor_id != vendor_id:
        raise ValidationError(
            "Sub-outsourcing entries must reference a contract of this vendor", status_code=422
        )
    # Deliberately NO is_archived check (PM-adjudicated DEFER-TO-#49, diverging
    # from the #43 asset-links strict-archived-target precedent): only the
    # archived VENDOR freezes chain writes; a chain on a soft-archived Contract
    # is the derivation engine's CHYBA ŘETĚZCE / DQ territory, like archived
    # predecessors.
    return contract


async def assert_chain_predecessor(
    db: AsyncSession,
    *,
    vendor_id: int,
    contract_id: int,
    predecessor_id: int,
    entry_id: int | None = None,
) -> VendorSubOutsourcing:
    """Write-time chain integrity the #49 Rank recursion relies on (all 422).

    The predecessor must exist and belong to the SAME Vendor and Contract
    (validated against the entry's post-mutation Contract), the entry can
    never be its own predecessor, and walking the predecessor chain must not
    reach the mutated entry — chains are short, so the walk is cheap. An
    ARCHIVED predecessor is deliberately allowed to exist: chain-break
    flagging is the derivation engine's job (#49), not a write block.
    """
    if entry_id is not None and predecessor_id == entry_id:
        raise ValidationError(
            "A sub-outsourcing entry cannot be its own predecessor", status_code=422
        )

    result = await db.execute(
        select(VendorSubOutsourcing).where(VendorSubOutsourcing.id == predecessor_id)
    )
    predecessor = result.scalar_one_or_none()
    if predecessor is None or predecessor.vendor_id != vendor_id or predecessor.contract_id != contract_id:
        raise ValidationError(
            "The predecessor must be a sub-outsourcing entry of the same vendor and contract",
            status_code=422,
        )

    if entry_id is not None:
        visited: set[int] = set()
        cursor: VendorSubOutsourcing | None = predecessor
        while cursor is not None:
            if cursor.id == entry_id:
                raise ValidationError(
                    "The predecessor chain must not cycle back to this entry", status_code=422
                )
            if cursor.id in visited:
                # Defensive termination guard; enforced data is acyclic.
                break
            visited.add(cursor.id)
            if cursor.predecessor_id is None:
                break
            cursor = (
                await db.execute(
                    select(VendorSubOutsourcing).where(VendorSubOutsourcing.id == cursor.predecessor_id)
                )
            ).scalar_one_or_none()

    return predecessor
