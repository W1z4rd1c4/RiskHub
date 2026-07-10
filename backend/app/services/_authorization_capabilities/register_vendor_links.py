from __future__ import annotations

from app.core.permissions import has_permission
from app.models import User
from app.schemas.asset import AssetVendorLinkCapabilities
from app.schemas.process import ProcessVendorLinkCapabilities


def asset_vendor_link_capabilities(current_user: User) -> AssetVendorLinkCapabilities:
    """Per-row Asset<->Vendor link capabilities (ADR-001 capability SSOT).

    Link rows carry no ownership or department scope of their own: reading
    needs BOTH ends' read permissions (enforced at the service seam) and
    mutating needs the REGISTER end's write permission — ``assets:write`` —
    so the manage-from-both-ends UI (the Vendor detail included) can gate
    row actions without re-deriving backend policy.
    """
    can_delete = (
        has_permission(current_user, "assets", "read")
        and has_permission(current_user, "vendors", "read")
        and has_permission(current_user, "assets", "write")
    )
    return AssetVendorLinkCapabilities(can_delete=bool(can_delete))


def process_vendor_link_capabilities(current_user: User) -> ProcessVendorLinkCapabilities:
    """Per-row Process<->Vendor link capabilities — register end is the Process."""
    can_delete = (
        has_permission(current_user, "processes", "read")
        and has_permission(current_user, "vendors", "read")
        and has_permission(current_user, "processes", "write")
    )
    return ProcessVendorLinkCapabilities(can_delete=bool(can_delete))
