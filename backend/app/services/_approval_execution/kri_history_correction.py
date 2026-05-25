from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceFailure, ValidationError
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.models.kri_history import KRIValueHistory
from app.services._kri_history.approval_execution import apply_approved_kri_history_correction

from .results import SideEffectResult, auto_reject_kri_approval

logger = logging.getLogger("app.services.approval_execution_service")


async def _apply_kri_history_correction(
    db: AsyncSession,
    approval: ApprovalRequest,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
) -> SideEffectResult:
    """Apply history correction to a KRI history entry."""
    entry_id = changes.get("history_entry_id")
    new_value = changes.get("new_value")
    old_value = changes.get("old_value")
    period_end = changes.get("period_end")

    if entry_id is None or new_value is None or old_value is None or period_end is None:
        raise ValidationError("Invalid KRI history correction payload")

    entry_result = await db.execute(select(KRIValueHistory).where(KRIValueHistory.id == entry_id).with_for_update())
    entry = entry_result.scalar_one_or_none()
    if entry is None:
        logger.warning("Approval #%s: KRI history entry %s no longer exists", approval.id, entry_id)
        return auto_reject_kri_approval(
            "KRI history correction no longer passes apply-time validation (history entry no longer exists).",
        )
    if entry.kri_id != kri.id:
        logger.warning("Approval #%s: KRI history entry %s no longer belongs to KRI %s", approval.id, entry_id, kri.id)
        return auto_reject_kri_approval(
            "KRI history correction no longer passes apply-time validation (history entry target changed).",
        )
    if entry.value != old_value:
        logger.warning(
            "Approval #%s: auto-rejecting stale KRI history correction; expected value %s, found %s",
            approval.id,
            old_value,
            entry.value,
        )
        return auto_reject_kri_approval(
            "KRI history correction no longer passes apply-time validation (history entry value changed).",
        )
    if entry.period_end.isoformat() != period_end:
        logger.warning(
            "Approval #%s: auto-rejecting stale KRI history correction; expected period %s, found %s",
            approval.id,
            period_end,
            entry.period_end.isoformat(),
        )
        return auto_reject_kri_approval(
            "KRI history correction no longer passes apply-time validation (history entry period changed).",
        )

    logger.info("Applying KRI history correction: entry %s, val %s", entry_id, new_value)

    try:
        await apply_approved_kri_history_correction(
            db=db,
            kri=kri,
            entry=entry,
            new_value=new_value,
            old_value=old_value,
            corrected_by=current_user,
            approval_id=approval.id,
        )
        return SideEffectResult.applied()

    except ValueError as e:
        logger.warning("Approval #%s: auto-rejecting stale KRI history correction: %s", approval.id, e)
        return auto_reject_kri_approval(
            f"KRI history correction no longer passes apply-time validation ({e}).",
        )
    except Exception as exc:
        logger.exception("Unexpected error in KRI history correction approval flow")
        raise ServiceFailure("Internal server error during KRI approval execution") from exc
