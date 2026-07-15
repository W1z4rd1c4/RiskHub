from __future__ import annotations

from app.core.permissions import has_permission
from app.models import User
from app.schemas.asset import AssetVendorLinkCapabilities
from app.schemas.process import ProcessVendorLinkCapabilities


def asset_vendor_link_capabilities(
    _current_user: User,
    *,
    can_update_asset: bool,
    ownership_pending: bool = False,
    register_end_active: bool = True,
    vendor_visible: bool,
) -> AssetVendorLinkCapabilities:
    """Per-row Asset<->Vendor link capabilities (ADR-001 capability SSOT).

    ``can_update_asset`` is the authoritative record policy result. Asset
    ownership and Owning Department Head scope may grant this capability
    without broad ``assets:write`` access. The Vendor end must remain
    independently visible, including for archived-Vendor cleanup.
    """
    can_delete = (
        register_end_active
        and not ownership_pending
        and vendor_visible
        and can_update_asset
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
