from __future__ import annotations

from app.models import User, Vendor
from app.schemas.vendor import VendorCapabilities, VendorLinkedRiskSummary, VendorListResponse, VendorRead
from app.services._vendor_workflow import vendor_capabilities


def vendor_to_read(
    vendor: Vendor,
    *,
    current_user: User | None = None,
    linked_risks: list[VendorLinkedRiskSummary] | None = None,
) -> VendorRead:
    base = VendorRead.model_validate(vendor)
    capabilities = (
        VendorCapabilities(**vendor_capabilities(current_user, vendor)) if current_user is not None else None
    )
    return base.model_copy(
        update={
            "department_name": vendor.department.name if vendor.department else None,
            "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
            "linked_risks": linked_risks or [],
            "capabilities": capabilities,
        }
    )


def vendor_list_response(
    *,
    vendors: list[Vendor],
    total: int,
    offset: int,
    limit: int,
    current_user: User | None = None,
    linked_risks_by_vendor_id: dict[int, list[VendorLinkedRiskSummary]] | None = None,
    capabilities: dict[str, bool] | None = None,
) -> VendorListResponse:
    return VendorListResponse(
        items=[
            vendor_to_read(
                v,
                current_user=current_user,
                linked_risks=(linked_risks_by_vendor_id or {}).get(v.id, []),
            )
            for v in vendors
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=capabilities,
    )
