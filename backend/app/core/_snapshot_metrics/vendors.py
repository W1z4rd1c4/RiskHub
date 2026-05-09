from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vendor import Vendor


async def count_active_vendors(db: AsyncSession, department_ids: list[int] | None) -> int:
    conditions = [Vendor.live()]
    if department_ids is not None:
        conditions.append(Vendor.department_id.in_(department_ids))
    return await db.scalar(select(func.count(Vendor.id)).where(*conditions)) or 0
