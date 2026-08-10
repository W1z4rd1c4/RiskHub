from __future__ import annotations

from app.core.permissions import has_permission
from app.models import User, VendorContract
from app.schemas.vendor_contract import VendorContractCapabilities


def vendor_contract_capabilities(
    current_user: User,
    contract: VendorContract,
    *,
    vendor_archived: bool,
) -> VendorContractCapabilities:
    """Per-row Contract action capabilities (ADR-001 capability SSOT).

    Contracts carry no per-row ownership: visibility is the
    ``vendor_contracts:read`` permission and maintenance (fields, archive,
    restore) is ``vendor_contracts:write`` — the reserved surface ships with
    read/write only, so archive/restore gates on write (risk manager and the
    CRO wildcard per the RBAC seed). Every mutation additionally requires the
    parent Vendor to be active: the register takes the strict archived-end
    stance, so contracts of an archived Vendor are read-only until restore.
    """
    can_read = has_permission(current_user, "vendor_contracts", "read")
    can_write = has_permission(current_user, "vendor_contracts", "write")
    vendor_active = not vendor_archived
    is_active = not contract.is_archived
    return VendorContractCapabilities(
        can_read=bool(can_read),
        can_update=bool(can_read and can_write and is_active and vendor_active),
        can_archive=bool(can_read and can_write and is_active and vendor_active),
        can_restore=bool(can_read and can_write and contract.is_archived and vendor_active),
    )
