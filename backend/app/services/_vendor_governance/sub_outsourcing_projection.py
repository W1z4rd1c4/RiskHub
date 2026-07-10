from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Vendor, VendorSubOutsourcing
from app.schemas.vendor_sub_outsourcing import VendorSubOutsourcingDerived, VendorSubOutsourcingRead
from app.services._authorization_capabilities import vendor_sub_outsourcing_capabilities

from .projection import compute_vendor_register_derivation


async def load_sub_outsourcing_derived_blocks(
    db: AsyncSession, vendor: Vendor, entries: list[VendorSubOutsourcing]
) -> dict[int, VendorSubOutsourcingDerived]:
    """Compute the engine-derived 09_Subdodávky block per chain entry (#49).

    The owning Vendor is the graph target — the whole Sub-outsourcing register
    rides along, so the Rank recursion sees every predecessor row.
    """
    if not entries:
        return {}
    derivation = await compute_vendor_register_derivation(db, [vendor])
    return {
        entry.id: VendorSubOutsourcingDerived.model_validate(derivation.sub_outsourcing[entry.id])
        for entry in entries
    }


def serialize_sub_outsourcing_detail(
    entry: VendorSubOutsourcing,
    *,
    current_user: User,
    vendor: Vendor,
    derived: VendorSubOutsourcingDerived | None = None,
) -> VendorSubOutsourcingRead:
    base = VendorSubOutsourcingRead.model_validate(entry)
    return base.model_copy(
        update={
            "capabilities": vendor_sub_outsourcing_capabilities(
                current_user, entry, vendor_archived=bool(vendor.is_archived)
            ),
            "derived": derived,
        }
    )


async def serialize_sub_outsourcing_detail_with_derived(
    db: AsyncSession,
    entry: VendorSubOutsourcing,
    *,
    current_user: User,
    vendor: Vendor,
) -> VendorSubOutsourcingRead:
    blocks = await load_sub_outsourcing_derived_blocks(db, vendor, [entry])
    return serialize_sub_outsourcing_detail(
        entry, current_user=current_user, vendor=vendor, derived=blocks.get(entry.id)
    )


async def serialize_sub_outsourcing_collection(
    db: AsyncSession,
    entries: list[VendorSubOutsourcing],
    *,
    current_user: User,
    vendor: Vendor,
) -> list[VendorSubOutsourcingRead]:
    blocks = await load_sub_outsourcing_derived_blocks(db, vendor, entries)
    return [
        serialize_sub_outsourcing_detail(
            entry, current_user=current_user, vendor=vendor, derived=blocks.get(entry.id)
        )
        for entry in entries
    ]
