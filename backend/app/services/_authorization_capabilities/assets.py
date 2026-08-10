from __future__ import annotations

from app.models import Asset, User
from app.schemas.asset import AssetCapabilities
from app.services._ict_register_lifecycle.asset_policy import (
    can_read_asset_record,
    can_update_asset_record,
)


def asset_capabilities(
    current_user: User,
    asset: Asset,
    *,
    ownership_pending: bool = False,
) -> AssetCapabilities:
    """Per-row Asset action capabilities (ADR-001 capability SSOT).

    Either Asset owner and the Owning Department Head receive record-specific
    read and update access. Assignment never grants archive/restore or access
    to any linked Process, Vendor, Risk, or counterpart Asset.
    """
    from app.core.permissions import has_permission

    can_read = can_read_asset_record(current_user, asset)
    can_write = can_update_asset_record(current_user, asset)
    can_delete = has_permission(current_user, "assets", "delete") and can_read
    is_active = not asset.is_archived
    return AssetCapabilities(
        can_read=bool(can_read),
        can_update=bool(can_write and is_active and not ownership_pending),
        can_archive=bool(can_read and can_delete and is_active),
        can_restore=bool(can_read and can_delete and asset.is_archived),
    )
