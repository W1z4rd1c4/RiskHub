from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Vendor


async def _get_vendor_with_deps(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(
        select(Vendor)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(Vendor.id == vendor_id)
    )
    return result.scalar_one_or_none()
