from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_vendor, can_read_vendor_id, has_permission, is_vendor_owner
from app.models import User, Vendor
from app.schemas.vendor import VendorCapabilities


async def can_view_vendor_link(db: AsyncSession, *, current_user: User, vendor_id: int | None) -> bool:
    if vendor_id is None:
        return False
    if not has_permission(current_user, "vendors", "read"):
        return False
    return await can_read_vendor_id(db, current_user, vendor_id)


def can_view_loaded_vendor(*, current_user: User, vendor) -> bool:
    return bool(
        vendor is not None
        and has_permission(current_user, "vendors", "read")
        and can_read_vendor(vendor, current_user)
    )


def vendor_capabilities(
    current_user: User,
    vendor: Vendor,
    *,
    can_manage_asset_links: bool = False,
    can_manage_process_links: bool = False,
    ownership_pending: bool = False,
) -> VendorCapabilities:
    can_write = has_permission(current_user, "vendors", "write")
    can_delete = has_permission(current_user, "vendors", "delete")
    is_owner = is_vendor_owner(vendor, current_user)
    has_vendor_read = bool(
        has_permission(current_user, "vendors", "read")
        and can_read_vendor(vendor, current_user)
    )
    is_visible = bool(is_owner or has_vendor_read)
    can_update = bool(
        is_owner
        or (can_write and has_vendor_read)
    )
    is_active = not vendor.is_archived
    can_archive = bool(has_vendor_read and can_delete and not vendor.is_archived)
    can_restore = bool(has_vendor_read and can_delete and vendor.is_archived)
    can_mutate_links = bool(
        has_vendor_read and is_active and can_update and not ownership_pending
    )
    return VendorCapabilities(
        can_read=bool(is_visible),
        can_update=bool(
            is_visible and is_active and can_update and not ownership_pending
        ),
        can_manage_accountability=bool(
            has_vendor_read and can_write and is_active and not ownership_pending
        ),
        can_archive=can_archive,
        can_restore=can_restore,
        can_create_linked_risk=bool(can_mutate_links and has_permission(current_user, "risks", "write")),
        can_create_linked_control=bool(can_mutate_links and has_permission(current_user, "controls", "write")),
        can_create_linked_kri=bool(can_mutate_links and has_permission(current_user, "risks", "write")),
        can_link_risk=bool(can_mutate_links and has_permission(current_user, "risks", "read")),
        can_link_control=bool(can_mutate_links and has_permission(current_user, "controls", "read")),
        can_link_kri=bool(can_mutate_links and has_permission(current_user, "risks", "read")),
        can_view_linked_risks=bool(has_vendor_read and has_permission(current_user, "risks", "read")),
        can_view_linked_controls=bool(has_vendor_read and has_permission(current_user, "controls", "read")),
        can_view_linked_kris=bool(has_vendor_read and has_permission(current_user, "risks", "read")),
        can_create_issue=bool(
            has_vendor_read
            and is_active
            and not ownership_pending
            and has_permission(current_user, "issues", "write")
        ),
        # ICT Register Contracts section (issue #44): reads follow
        # vendor_contracts:read, maintenance follows vendor_contracts:write
        # and requires an active Vendor (strict archived-end stance).
        can_view_contracts=bool(has_vendor_read and has_permission(current_user, "vendor_contracts", "read")),
        can_manage_contracts=bool(
            has_vendor_read
            and is_active
            and not ownership_pending
            and has_permission(current_user, "vendor_contracts", "write")
        ),
        # ICT Register Sub-outsourcing section (issue #45): the same governed
        # surface as Contracts — the fourth-party contract chain — so both
        # gates follow the vendor_contracts resource.
        can_view_sub_outsourcing=bool(
            has_vendor_read and has_permission(current_user, "vendor_contracts", "read")
        ),
        can_manage_sub_outsourcing=bool(
            has_vendor_read
            and is_active
            and not ownership_pending
            and has_permission(current_user, "vendor_contracts", "write")
        ),
        # The Vendor-end Asset-link collection is independently authorized by
        # Vendor visibility and filters every row through canonical Asset read
        # policy. Keep it available for archived-Vendor cleanup and pending
        # Asset governance; add/delete authority is projected separately.
        can_view_asset_links=bool(
            has_vendor_read
        ),
        can_manage_asset_links=bool(
            has_vendor_read
            and is_active
            and not ownership_pending
            and can_manage_asset_links
        ),
        can_manage_process_links=bool(
            has_vendor_read
            and is_active
            and not ownership_pending
            and can_manage_process_links
        ),
    )
