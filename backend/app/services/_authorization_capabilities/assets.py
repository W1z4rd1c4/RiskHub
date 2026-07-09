from __future__ import annotations

from app.core.permissions import has_permission
from app.models import Asset, User
from app.schemas.asset import AssetCapabilities


def asset_capabilities(current_user: User, asset: Asset) -> AssetCapabilities:
    """Per-row Asset action capabilities (ADR-001 capability SSOT).

    Assets carry no per-row ownership or department scope: visibility is the
    ``assets:read`` permission, maintenance (fields and Link relations) is
    ``assets:write`` and archive/restore is ``assets:delete`` (risk manager
    and the CRO wildcard per the RBAC seed) — mirroring Processes.
    """
    can_read = has_permission(current_user, "assets", "read")
    can_write = has_permission(current_user, "assets", "write")
    can_delete = has_permission(current_user, "assets", "delete")
    is_active = not asset.is_archived
    return AssetCapabilities(
        can_read=bool(can_read),
        can_update=bool(can_read and can_write and is_active),
        can_archive=bool(can_read and can_delete and is_active),
        can_restore=bool(can_read and can_delete and asset.is_archived),
    )
