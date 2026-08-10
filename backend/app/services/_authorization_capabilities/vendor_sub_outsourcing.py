from __future__ import annotations

from app.core.permissions import has_permission
from app.models import User, VendorSubOutsourcing
from app.schemas.vendor_sub_outsourcing import VendorSubOutsourcingCapabilities


def vendor_sub_outsourcing_capabilities(
    current_user: User,
    entry: VendorSubOutsourcing,
    *,
    vendor_archived: bool,
) -> VendorSubOutsourcingCapabilities:
    """Per-row Sub-outsourcing action capabilities (ADR-001 capability SSOT).

    Sub-outsourcing reuses the ``vendor_contracts`` resource — it is the same
    governed surface, the fourth-party contract chain: visibility is
    ``vendor_contracts:read`` and maintenance (fields, archive, restore) is
    ``vendor_contracts:write`` (risk manager and the CRO wildcard per the
    RBAC seed). Every mutation additionally requires the parent Vendor to be
    active: the register takes the strict archived-end stance, so entries of
    an archived Vendor are read-only until restore.
    """
    can_read = has_permission(current_user, "vendor_contracts", "read")
    can_write = has_permission(current_user, "vendor_contracts", "write")
    vendor_active = not vendor_archived
    is_active = not entry.is_archived
    return VendorSubOutsourcingCapabilities(
        can_read=bool(can_read),
        can_update=bool(can_read and can_write and is_active and vendor_active),
        can_archive=bool(can_read and can_write and is_active and vendor_active),
        can_restore=bool(can_read and can_write and entry.is_archived and vendor_active),
    )
