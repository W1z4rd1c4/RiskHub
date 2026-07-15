from __future__ import annotations

from app.core.permissions import has_permission
from app.models import User
from app.schemas.asset import AssetVendorLinkCapabilities
from app.schemas.process import ProcessVendorLinkCapabilities


def asset_vendor_link_capabilities(
    current_user: User,
    *,
    register_end_active: bool = True,
) -> AssetVendorLinkCapabilities:
    """Per-row Asset<->Vendor link capabilities (ADR-001 capability SSOT).

    Link rows carry no ownership or department scope of their own: reading
    needs BOTH ends' read permissions (enforced at the service seam) and
    mutating needs the REGISTER end's write permission — ``assets:write`` —
    so the manage-from-both-ends UI (the Vendor detail included) can gate
    row actions without re-deriving backend policy.
    """
    can_delete = (
        register_end_active
        and has_permission(current_user, "assets", "read")
        and has_permission(current_user, "vendors", "read")
        and has_permission(current_user, "assets", "write")
    )
    return AssetVendorLinkCapabilities(can_delete=bool(can_delete))


def process_vendor_link_capabilities(
    current_user: User,
    *,
    can_update_process: bool,
    ownership_pending: bool = False,
    register_end_active: bool = True,
) -> ProcessVendorLinkCapabilities:
    """Per-row Process<->Vendor link capabilities — register end is the Process.

    ``can_update_process`` is the authoritative record policy result. In
    particular, Process ownership and Owning Department Head scope may grant
    this capability without granting broad ``processes:write`` access.
    """
    can_delete = (
        register_end_active
        and not ownership_pending
        and has_permission(current_user, "vendors", "read")
        and can_update_process
    )
    return ProcessVendorLinkCapabilities(can_delete=bool(can_delete))
