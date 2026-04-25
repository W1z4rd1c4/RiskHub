from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models.control import Control
from app.models.orphaned_item import OrphanedItem
from app.models.risk import Risk

from .logging import logger


async def _already_flagged(
    db: AsyncSession,
    item_type: str,
    item_id: int,
    status: str = "pending",
) -> bool:
    """Check if an orphan record already exists for this item."""
    result = await db.execute(
        select(OrphanedItem).where(
            OrphanedItem.item_type == item_type,
            OrphanedItem.item_id == item_id,
            OrphanedItem.status == status,
        )
    )
    return result.scalar_one_or_none() is not None


async def _create_orphan(
    db: AsyncSession,
    item_type: str,
    item_id: int,
    previous_owner_id: int,
    *,
    orphaned_at: datetime | None = None,
) -> OrphanedItem:
    """Create and add a new OrphanedItem record."""
    orphan = OrphanedItem(
        item_type=item_type,
        item_id=item_id,
        previous_owner_id=previous_owner_id,
        status="pending",
        orphaned_at=orphaned_at or utc_now(),
    )
    db.add(orphan)
    logger.info(f"Flagged orphaned {item_type}: id={item_id}")
    return orphan


async def _get_item_details(
    db: AsyncSession,
    item_type: str,
    item_id: int,
) -> tuple[str, str | None, str | None, str | None]:
    """
    Fetch display details for an orphaned item.

    Returns (item_name, item_description, item_identifier, department_name).
    """
    from sqlalchemy.orm import selectinload

    item_name = "Unknown"
    item_description = None
    item_identifier = None
    department_name = None

    if item_type == "risk":
        result = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == item_id))
        risk = result.scalar_one_or_none()
        if risk:
            item_name = risk.name or "Unknown risk"
            item_description = risk.description
            item_identifier = risk.risk_id_code
            if risk.department:
                department_name = risk.department.name

    elif item_type == "control":
        result = await db.execute(
            select(Control).options(selectinload(Control.department)).where(Control.id == item_id)
        )
        control = result.scalar_one_or_none()
        if control:
            item_name = control.name or "Unknown control"
            item_description = control.description
            item_identifier = None
            if control.department:
                department_name = control.department.name

    elif item_type == "kri":
        from app.models.key_risk_indicator import KeyRiskIndicator

        kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == item_id))
        kri = kri_result.scalar_one_or_none()
        if kri:
            item_name = kri.metric_name or "Unknown KRI"
            item_description = kri.description
            item_identifier = None
            risk_res = await db.execute(
                select(Risk).options(selectinload(Risk.department)).where(Risk.id == kri.risk_id)
            )
            kri_risk = risk_res.scalar_one_or_none()
            if kri_risk and kri_risk.department:
                department_name = kri_risk.department.name

    return item_name, item_description, item_identifier, department_name
