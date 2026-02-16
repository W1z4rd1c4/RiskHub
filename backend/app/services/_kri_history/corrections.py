from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.kri_history import KRIValueHistory

from .logging import logger


async def apply_history_correction(
    db: AsyncSession,
    entry_id: int,
    new_value: float,
    corrected_by_id: Optional[int] = None,
) -> KRIValueHistory:
    """
    Apply a correction to a historical entry.

    If the corrected entry is the latest for the KRI, also updates current_value.

    Args:
        db: Database session
        entry_id: ID of the history entry to correct
        new_value: The corrected value
        corrected_by_id: ID of user making the correction

    Returns:
        Updated KRIValueHistory entry
    """
    # Get the entry
    result = await db.execute(
        select(KRIValueHistory)
        .where(KRIValueHistory.id == entry_id)
        .options(selectinload(KRIValueHistory.kri))
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise ValueError(f"History entry {entry_id} not found")

    # Recalculate breach status
    if new_value < entry.lower_limit:
        breach_status = "below"
    elif new_value > entry.upper_limit:
        breach_status = "above"
    else:
        breach_status = "within"

    # Update entry
    entry.value = new_value
    entry.breach_status = breach_status

    # Check if this is the latest entry for the KRI
    latest_result = await db.execute(
        select(KRIValueHistory)
        .where(KRIValueHistory.kri_id == entry.kri_id)
        .order_by(KRIValueHistory.period_end.desc(), KRIValueHistory.recorded_at.desc())
        .limit(1)
    )
    latest_entry = latest_result.scalar_one_or_none()

    if latest_entry and latest_entry.id == entry.id:
        # Update KRI current value
        entry.kri.current_value = new_value
        if entry.kri.last_period_end is None or entry.period_end >= entry.kri.last_period_end:
            entry.kri.last_period_end = entry.period_end
        logger.info(f"Updated KRI {entry.kri_id} current_value to {new_value} from history correction")

    await db.flush()
    logger.info(f"Applied correction to history entry {entry_id}: value {new_value}")

    return entry

