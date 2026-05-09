from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit.issue import issue_status_changed
from app.core.datetime_utils import utc_now
from app.models import Issue, User
from app.models.issue import IssueSourceType, IssueStatus
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.kri_history import KRIValueHistory
from app.services._monitoring_status.kris import classify_kri_breach

from .logging import logger

AUTO_CLOSED_KRI_BREACH_NOTE = "Auto-closed because corrected KRI breach is now within limits."


def _status_value(status: IssueStatus | str) -> str:
    return status.value if isinstance(status, IssueStatus) else str(status)


async def _close_retracted_kri_breach_issues(
    db: AsyncSession,
    *,
    entry: KRIValueHistory,
    corrected_by_id: int | None,
) -> None:
    result = await db.execute(
        select(Issue)
        .where(
            Issue.source_type == IssueSourceType.kri_breach,
            Issue.source_id == entry.id,
            Issue.status != IssueStatus.closed,
        )
        .with_for_update()
    )
    issues = list(result.scalars().all())
    if not issues:
        return

    actor = await db.get(User, corrected_by_id) if corrected_by_id is not None else None
    now = utc_now()
    for issue in issues:
        old_status = _status_value(issue.status)
        old_closed_at = issue.closed_at
        old_validation_note = issue.validation_note
        issue.status = IssueStatus.closed
        issue.closed_at = now
        issue.validation_note = AUTO_CLOSED_KRI_BREACH_NOTE
        if actor is not None:
            await issue_status_changed(
                db,
                actor=actor,
                issue=issue,
                changes={
                    "status": {"old": old_status, "new": IssueStatus.closed.value},
                    "closed_at": {"old": old_closed_at, "new": now},
                    "validation_note": {"old": old_validation_note, "new": AUTO_CLOSED_KRI_BREACH_NOTE},
                },
                description=AUTO_CLOSED_KRI_BREACH_NOTE,
            )


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
        .with_for_update()
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise ValueError(f"History entry {entry_id} not found")
    kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == entry.kri_id).with_for_update())
    locked_kri = kri_result.scalar_one_or_none()
    if locked_kri is None:
        raise ValueError(f"KRI {entry.kri_id} not found")

    breach_status = classify_kri_breach(
        current_value=new_value,
        lower_limit=entry.lower_limit,
        upper_limit=entry.upper_limit,
    )

    # Update entry
    entry.value = new_value
    entry.breach_status = breach_status
    if breach_status == "within":
        await _close_retracted_kri_breach_issues(db, entry=entry, corrected_by_id=corrected_by_id)

    # Check if this is the latest entry for the KRI
    latest_result = await db.execute(
        select(KRIValueHistory)
        .where(KRIValueHistory.kri_id == entry.kri_id)
        .order_by(
            KRIValueHistory.period_end.desc(),
            KRIValueHistory.recorded_at.desc(),
            KRIValueHistory.id.desc(),
        )
        .limit(1)
    )
    latest_entry = latest_result.scalar_one_or_none()

    if latest_entry and latest_entry.id == entry.id:
        # Update KRI current value
        locked_kri.current_value = new_value
        if locked_kri.last_period_end is None or entry.period_end >= locked_kri.last_period_end:
            locked_kri.last_period_end = entry.period_end
        logger.info(f"Updated KRI {entry.kri_id} current_value to {new_value} from history correction")

    await db.flush()
    logger.info(f"Applied correction to history entry {entry_id}: value {new_value}")

    return entry
