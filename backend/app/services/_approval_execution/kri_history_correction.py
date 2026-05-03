from __future__ import annotations

import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.models.activity_log import ActivityAction, ActivityEntityType
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
        raise HTTPException(status_code=400, detail="Invalid KRI history correction payload")

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

        await activity_logger.log_activity(
            db,
            entity_type=ActivityEntityType.KRI_VALUE,
            entity_id=entry_id,
            entity_name=f"{kri.metric_name} ({updated_entry.period_end.isoformat()})",
            safe_entity_label=f"{kri.metric_name} ({updated_entry.period_end.isoformat()})",
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=department_id,
            changes={"value": {"old": old_value, "new": new_value}},
            description=f"Corrected via approval #{approval.id}",
        )

        kri_changes = build_kri_value_mutation_changes(kri, mutation_snapshot)
        if kri_changes:
            await activity_logger.log_activity(
                db,
                entity_type=ActivityEntityType.KRI,
                entity_id=kri.id,
                entity_name=f"{kri.metric_name}",
                safe_entity_label=kri.metric_name,
                action=ActivityAction.UPDATE,
                actor=current_user,
                department_id=department_id,
                changes=kri_changes,
                description=f"Updated via approval #{approval.id} (history correction)",
            )
        return SideEffectResult.applied()

    except ValueError as e:
        logger.warning("Approval #%s: auto-rejecting stale KRI history correction: %s", approval.id, e)
        return _auto_reject_kri_approval(
            approval,
            f"KRI history correction no longer passes apply-time validation ({e}).",
        )
    except Exception:
        logger.exception("Unexpected error in KRI history correction approval flow")
        raise HTTPException(status_code=500, detail="Internal server error during KRI approval execution")
