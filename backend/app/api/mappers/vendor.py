from __future__ import annotations

from app.models import Vendor
from app.schemas.vendor import VendorLinkedRiskSummary, VendorListResponse, VendorRead


def vendor_to_read(vendor: Vendor, *, linked_risks: list[VendorLinkedRiskSummary] | None = None) -> VendorRead:
    base = VendorRead.model_validate(vendor)
    return base.model_copy(
        update={
            "department_name": vendor.department.name if vendor.department else None,
            "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
            "linked_risks": linked_risks or [],
        }
    )


def vendor_list_response(
    *,
    vendors: list[Vendor],
    total: int,
    offset: int,
    limit: int,
    linked_risks_by_vendor_id: dict[int, list[VendorLinkedRiskSummary]] | None = None,
) -> VendorListResponse:
    return VendorListResponse(
        items=[vendor_to_read(v, linked_risks=(linked_risks_by_vendor_id or {}).get(v.id, [])) for v in vendors],
        total=total,
        offset=offset,
        limit=limit,
    )
