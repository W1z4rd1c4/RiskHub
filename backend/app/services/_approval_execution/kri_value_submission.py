from __future__ import annotations

import logging
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.datetime_utils import coerce_utc
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services._kri_history.governance import (
    build_kri_value_history_activity_changes,
    build_kri_value_mutation_changes,
    capture_kri_value_mutation_snapshot,
)

from .results import SideEffectResult

logger = logging.getLogger("app.services.approval_execution_service")


def _auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
    return SideEffectResult.auto_rejected(reason)


async def _apply_kri_value_submission(
    db: AsyncSession,
    approval: ApprovalRequest,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> SideEffectResult:
    """Apply value submission (new history entry) to a KRI."""
    from datetime import date as date_type

    from app.services.kri_history_service import KRIHistoryService

    value_change = changes.get("current_value")
    period_end_str = changes.get("period_end")
    recorded_at_str = changes.get("recorded_at")

    if value_change is None or period_end_str is None:
        raise HTTPException(status_code=400, detail="Invalid KRI value submission payload")

    period_end = date_type.fromisoformat(period_end_str)
    recorded_at = coerce_utc(datetime.fromisoformat(recorded_at_str)) if recorded_at_str else None

    mutation_snapshot = capture_kri_value_mutation_snapshot(kri)

    try:
        logger.info(f"Recording KRI value for approval: {value_change.get('new')}")
        history_entry = await KRIHistoryService.record_value(
            db=db,
            kri=kri,
            value=value_change.get("new"),
            recorded_by_id=current_user.id,
            recorded_at=recorded_at,
            period_end=period_end,
            is_privileged=False,
            validation_date=recorded_at.date() if recorded_at else None,
        )

        await activity_logger.log_activity(
            db,
            entity_type=ActivityEntityType.KRI_VALUE,
            entity_id=history_entry.id,
            entity_name=f"{kri.metric_name} ({history_entry.period_end.isoformat()})",
            safe_entity_label=f"{kri.metric_name} ({history_entry.period_end.isoformat()})",
            action=ActivityAction.CREATE,
            actor=current_user,
            department_id=department_id,
            changes=build_kri_value_history_activity_changes(
                old_value=value_change.get("old"),
                new_value=value_change.get("new"),
                period_end=period_end,
            ),
            description=f"Recorded via approval #{approval_id}",
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
                description=f"Updated via approval #{approval_id} (value submission)",
            )
        return SideEffectResult.applied()

    except ValueError as e:
        logger.warning("Approval #%s: auto-rejecting stale KRI value submission: %s", approval_id, e)
        return _auto_reject_kri_approval(
            approval,
            f"KRI value submission no longer passes apply-time validation ({e}).",
        )
    except Exception:
        logger.exception("Unexpected error in KRI value submission approval flow")
        raise HTTPException(status_code=500, detail="Internal server error during KRI approval execution")
