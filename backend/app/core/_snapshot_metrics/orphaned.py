from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.orphaned_item import OrphanedItem
from app.models.risk import Risk


async def count_orphaned_items(db: AsyncSession, department_ids: list[int] | None) -> int:
    if department_ids is None:
        return await db.scalar(select(func.count(OrphanedItem.id)).where(OrphanedItem.resolved_at.is_(None))) or 0

    orphaned_risks = await db.scalar(
        select(func.count(OrphanedItem.id))
        .join(Risk, (OrphanedItem.item_type == "risk") & (OrphanedItem.item_id == Risk.id))
        .where(OrphanedItem.resolved_at.is_(None), Risk.department_id.in_(department_ids))
    )
    orphaned_controls = await db.scalar(
        select(func.count(OrphanedItem.id))
        .join(Control, (OrphanedItem.item_type == "control") & (OrphanedItem.item_id == Control.id))
        .where(OrphanedItem.resolved_at.is_(None), Control.department_id.in_(department_ids))
    )
    # KRI orphans are a first-class item_type (see services/_orphaned_items/flagging.py
    # and stats.py::get_orphan_stats, which counts them via the same scoped join). The
    # scoped snapshot path historically omitted them, so a department-scoped dashboard
    # under-counted orphans relative to both the stats surface and the unscoped path.
    # A KRI inherits its department from its parent Risk (KRIs have no department column).
    orphaned_kris = await db.scalar(
        select(func.count(OrphanedItem.id))
        .join(KeyRiskIndicator, (OrphanedItem.item_type == "kri") & (OrphanedItem.item_id == KeyRiskIndicator.id))
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(OrphanedItem.resolved_at.is_(None), Risk.department_id.in_(department_ids))
    )
    return (orphaned_risks or 0) + (orphaned_controls or 0) + (orphaned_kris or 0)
