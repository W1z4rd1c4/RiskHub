from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orphaned_item import OrphanedItem

from .core import _get_item_details


async def get_pending_orphans(
    db: AsyncSession,
    item_type: Optional[str] = None,
) -> list[OrphanedItem]:
    """
    Get all pending orphaned items.

    Args:
        db: Database session
        item_type: Optional filter by "risk" or "control"

    Returns:
        List of pending OrphanedItem records
    """
    query = select(OrphanedItem).where(OrphanedItem.status == "pending")

    if item_type:
        query = query.where(OrphanedItem.item_type == item_type)

    query = query.order_by(OrphanedItem.orphaned_at.desc())

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_pending_orphans_with_details(
    db: AsyncSession,
    item_type: Optional[str] = None,
    status: str = "pending",
) -> list[dict]:
    """
    Get orphaned items with full details including item names and owner info.

    Returns list of dicts matching OrphanedItemDetail schema.
    """
    from sqlalchemy.orm import selectinload

    query = select(OrphanedItem).options(selectinload(OrphanedItem.previous_owner))

    if status:
        query = query.where(OrphanedItem.status == status)
    if item_type:
        query = query.where(OrphanedItem.item_type == item_type)

    query = query.order_by(OrphanedItem.orphaned_at.desc())

    result = await db.execute(query)
    orphans = result.scalars().all()

    details = []
    for orphan in orphans:
        item_name, item_description, item_identifier, department_name = await _get_item_details(
            db,
            orphan.item_type,
            orphan.item_id,
        )

        details.append(
            {
                "id": orphan.id,
                "item_type": orphan.item_type,
                "item_id": orphan.item_id,
                "item_name": item_name,
                "item_description": item_description,
                "item_identifier": item_identifier,
                "department_name": department_name,
                "previous_owner_name": orphan.previous_owner.name if orphan.previous_owner else "Unknown",
                "previous_owner_email": orphan.previous_owner.email if orphan.previous_owner else "unknown@example.com",
                "orphaned_at": orphan.orphaned_at,
                "status": orphan.status,
            }
        )

    return details


async def get_orphan_detail(db: AsyncSession, orphan_id: int) -> dict | None:
    """
    Get detailed information about a single orphaned item.
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(OrphanedItem)
        .options(selectinload(OrphanedItem.previous_owner))
        .where(OrphanedItem.id == orphan_id)
    )
    orphan = result.scalar_one_or_none()

    if not orphan:
        return None

    item_name, item_description, item_identifier, department_name = await _get_item_details(
        db,
        orphan.item_type,
        orphan.item_id,
    )

    return {
        "id": orphan.id,
        "item_type": orphan.item_type,
        "item_id": orphan.item_id,
        "item_name": item_name,
        "item_description": item_description,
        "item_identifier": item_identifier,
        "department_name": department_name,
        "previous_owner_name": orphan.previous_owner.name if orphan.previous_owner else "Unknown",
        "previous_owner_email": orphan.previous_owner.email if orphan.previous_owner else "unknown@example.com",
        "orphaned_at": orphan.orphaned_at,
        "status": orphan.status,
    }

