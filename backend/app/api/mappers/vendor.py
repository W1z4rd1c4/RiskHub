from __future__ import annotations

from app.models import User, Vendor
from app.schemas.vendor import (
    VendorLinkedRiskSummary,
    VendorListCapabilities,
    VendorListResponse,
    VendorOwnerRead,
    VendorRead,
)
from app.services.authorization_capabilities import vendor_capabilities


def vendor_to_read(
    vendor: Vendor,
    *,
    current_user: User | None = None,
    linked_risks: list[VendorLinkedRiskSummary] | None = None,
    can_manage_asset_links: bool = False,
    can_manage_process_links: bool = False,
    ownership_pending: bool = False,
) -> VendorRead:
    base = VendorRead.model_validate(
        {column.name: getattr(vendor, column.name) for column in Vendor.__table__.columns}
    )
    owner = vendor.outsourcing_owner
    owner_projection = None
    if owner is not None and owner.role is not None:
        owner_projection = VendorOwnerRead(
            name=owner.name,
            email=owner.email,
            role_name=owner.role.name,
            department_name=(
                owner.department.name if owner.department is not None else None
            ),
        )
    if ownership_pending:
        ownership_status = "pending_governance"
    elif owner is None:
        ownership_status = "legacy_unassigned"
    elif owner.is_active:
        ownership_status = "assigned"
    else:
        ownership_status = "invalid_assignment"
    capabilities = (
        vendor_capabilities(
            current_user,
            vendor,
            can_manage_asset_links=can_manage_asset_links,
            can_manage_process_links=can_manage_process_links,
            ownership_pending=ownership_pending,
        )
        if current_user is not None
        else None
    )
    return base.model_copy(
        update={
            "department_name": vendor.department.name if vendor.department else None,
            "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
            "outsourcing_owner": owner_projection,
            "owner_orphaned": ownership_pending,
            "ownership_status": ownership_status,
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
    can_manage_asset_links: bool = False,
    can_manage_process_links: bool = False,
    pending_vendor_ids: set[int] | None = None,
) -> VendorListResponse:
    pending_vendor_ids = pending_vendor_ids or set()
    return VendorListResponse(
        items=[
            vendor_to_read(
                v,
                current_user=current_user,
                linked_risks=(linked_risks_by_vendor_id or {}).get(v.id, []),
                can_manage_asset_links=can_manage_asset_links,
                can_manage_process_links=can_manage_process_links,
                ownership_pending=v.id in pending_vendor_ids,
            )
            for v in vendors
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=VendorListCapabilities.model_validate(capabilities) if capabilities is not None else None,
    )
