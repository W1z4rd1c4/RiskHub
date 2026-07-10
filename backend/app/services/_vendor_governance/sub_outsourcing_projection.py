from __future__ import annotations

from app.models import User, Vendor, VendorSubOutsourcing
from app.schemas.vendor_sub_outsourcing import VendorSubOutsourcingRead
from app.services._authorization_capabilities import vendor_sub_outsourcing_capabilities


def serialize_sub_outsourcing_detail(
    entry: VendorSubOutsourcing, *, current_user: User, vendor: Vendor
) -> VendorSubOutsourcingRead:
    base = VendorSubOutsourcingRead.model_validate(entry)
    return base.model_copy(
        update={
            "capabilities": vendor_sub_outsourcing_capabilities(
                current_user, entry, vendor_archived=bool(vendor.is_archived)
            )
        }
    )


def serialize_sub_outsourcing_collection(
    entries: list[VendorSubOutsourcing], *, current_user: User, vendor: Vendor
) -> list[VendorSubOutsourcingRead]:
    return [
        serialize_sub_outsourcing_detail(entry, current_user=current_user, vendor=vendor)
        for entry in entries
    ]
