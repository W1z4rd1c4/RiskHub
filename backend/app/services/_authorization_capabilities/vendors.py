from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_vendor, can_read_vendor_id, has_permission
from app.models import User


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
