from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.audit.kri import kri_history_corrected, kri_updated
from app.core.exceptions import ServiceFailure, ValidationError
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.models.kri_history import KRIValueHistory
from app.services._kri_history.governance import (
    build_kri_value_mutation_changes,
    capture_kri_value_mutation_snapshot,
)

from .results import SideEffectResult

logger = logging.getLogger("app.services.approval_execution_service")


def _auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
    return SideEffectResult.auto_rejected(reason)


async def _apply_kri_history_correction(
    db: AsyncSession,
    approval: ApprovalRequest,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    department_id: int | None,
) -> SideEffectResult:
    """Apply history correction to a KRI history entry."""
    from app.services.kri_history_service import KRIHistoryService

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
        return _auto_reject_kri_approval(
            approval,
            "KRI history correction no longer passes apply-time validation (history entry no longer exists).",
        )
    if entry.kri_id != kri.id:
        logger.warning("Approval #%s: KRI history entry %s no longer belongs to KRI %s", approval.id, entry_id, kri.id)
        return _auto_reject_kri_approval(
            approval,
            "KRI history correction no longer passes apply-time validation (history entry target changed).",
        )
    if entry.value != old_value:
        logger.warning(
            "Approval #%s: auto-rejecting stale KRI history correction; expected value %s, found %s",
            approval.id,
            old_value,
            entry.value,
        )
        return _auto_reject_kri_approval(
            approval,
            "KRI history correction no longer passes apply-time validation (history entry value changed).",
        )
    if entry.period_end.isoformat() != period_end:
        logger.warning(
            "Approval #%s: auto-rejecting stale KRI history correction; expected period %s, found %s",
            approval.id,
            period_end,
            entry.period_end.isoformat(),
        )
        return _auto_reject_kri_approval(
            approval,
            "KRI history correction no longer passes apply-time validation (history entry period changed).",
        )

    mutation_snapshot = capture_kri_value_mutation_snapshot(kri)

    logger.info(f"Applying KRI history correction: entry {entry_id}, val {new_value}")

    try:
        updated_entry = await KRIHistoryService.apply_history_correction(
            db=db,
            entry_id=entry_id,
            new_value=new_value,
            corrected_by_id=current_user.id,
        )

        await kri_history_corrected(
            db,
            kri=kri,
            history_entry=updated_entry,
            actor=current_user,
            changes={"value": {"old": old_value, "new": new_value}},
            description=f"Corrected via approval #{approval.id}",
            log_activity_func=activity_logger.log_activity,
        )

        kri_changes = build_kri_value_mutation_changes(kri, mutation_snapshot)
        if kri_changes:
            await kri_updated(
                db,
                actor=current_user,
                kri=kri,
                changes=kri_changes,
                description=f"Updated via approval #{approval.id} (history correction)",
                log_activity_func=activity_logger.log_activity,
            )
        return SideEffectResult.applied()

    except ValueError as e:
        logger.warning("Approval #%s: auto-rejecting stale KRI history correction: %s", approval.id, e)
        return _auto_reject_kri_approval(
            approval,
            f"KRI history correction no longer passes apply-time validation ({e}).",
        )
    except Exception as exc:
        logger.exception("Unexpected error in KRI history correction approval flow")
        raise ServiceFailure("Internal server error during KRI approval execution") from exc
