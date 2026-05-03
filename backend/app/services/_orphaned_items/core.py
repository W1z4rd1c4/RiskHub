from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models.orphaned_item import OrphanedItem

from .governance import load_orphan_display_projection
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
    projection = await load_orphan_display_projection(db, item_type, item_id)
    return (
        projection.item_name,
        projection.item_description,
        projection.item_identifier,
        projection.department_name,
    )
