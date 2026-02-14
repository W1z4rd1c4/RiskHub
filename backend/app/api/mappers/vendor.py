from __future__ import annotations

from app.models import Vendor
from app.schemas.vendor import VendorListResponse, VendorRead


def vendor_to_read(vendor: Vendor) -> VendorRead:
    base = VendorRead.model_validate(vendor)
    return base.model_copy(
        update={
            "department_name": vendor.department.name if vendor.department else None,
            "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
        }
    )


def vendor_list_response(*, vendors: list[Vendor], total: int, skip: int, limit: int) -> VendorListResponse:
    return VendorListResponse(items=[vendor_to_read(v) for v in vendors], total=total, skip=skip, limit=limit)

