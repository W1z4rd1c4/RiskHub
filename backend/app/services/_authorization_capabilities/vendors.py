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


def vendor_capabilities(current_user: User, vendor: Vendor) -> VendorCapabilities:
    can_write = has_permission(current_user, "vendors", "write")
    can_delete = has_permission(current_user, "vendors", "delete")
    can_update = can_write or is_vendor_owner(vendor, current_user)
    is_visible = can_read_vendor(vendor, current_user)
    is_active = not vendor.is_archived
    can_archive = bool(is_visible and can_delete and not vendor.is_archived)
    can_restore = bool(is_visible and can_delete and vendor.is_archived)
    can_mutate_links = bool(is_visible and is_active and can_update)
    return VendorCapabilities(
        can_read=bool(is_visible),
        can_update=bool(is_visible and is_active and can_update),
        can_archive=can_archive,
        can_restore=can_restore,
        can_create_linked_risk=bool(can_mutate_links and has_permission(current_user, "risks", "write")),
        can_create_linked_control=bool(can_mutate_links and has_permission(current_user, "controls", "write")),
        can_create_linked_kri=bool(can_mutate_links and has_permission(current_user, "risks", "write")),
        can_link_risk=bool(can_mutate_links and has_permission(current_user, "risks", "read")),
        can_link_control=bool(can_mutate_links and has_permission(current_user, "controls", "read")),
        can_link_kri=bool(can_mutate_links and has_permission(current_user, "risks", "read")),
        can_view_linked_risks=bool(is_visible and has_permission(current_user, "risks", "read")),
        can_view_linked_controls=bool(is_visible and has_permission(current_user, "controls", "read")),
        can_view_linked_kris=bool(is_visible and has_permission(current_user, "risks", "read")),
        can_create_issue=bool(is_visible and is_active and has_permission(current_user, "issues", "write")),
    )
