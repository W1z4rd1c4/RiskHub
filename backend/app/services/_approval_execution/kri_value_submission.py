from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.audit.kri import kri_updated, kri_value_created
from app.core.datetime_utils import coerce_utc
from app.core.exceptions import ServiceFailure, ValidationError
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.services._kri_history.governance import (
    build_kri_value_mutation_changes,
    capture_kri_value_mutation_snapshot,
)

from .results import SideEffectResult, auto_reject_kri_approval

logger = logging.getLogger("app.services.approval_execution_service")


def _pending_change_new(value):
    if isinstance(value, dict):
        return value.get("new")
    return value


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
    period_end_str = _pending_change_new(changes.get("period_end"))
    recorded_at_str = _pending_change_new(changes.get("recorded_at"))

    if value_change is None or period_end_str is None:
        raise ValidationError("Invalid KRI value submission payload")

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

        await kri_value_created(
            db,
            kri=kri,
            history_entry=history_entry,
            value=value_change.get("new"),
            old_value=value_change.get("old"),
            actor=current_user,
            description=f"Recorded via approval #{approval_id}",
            log_activity_func=activity_logger.log_activity,
        )

        kri_changes = build_kri_value_mutation_changes(kri, mutation_snapshot)
        if kri_changes:
            await kri_updated(
                db,
                actor=current_user,
                kri=kri,
                changes=kri_changes,
                description=f"Updated via approval #{approval_id} (value submission)",
                log_activity_func=activity_logger.log_activity,
            )
        return SideEffectResult.applied()

    except ValueError as e:
        logger.warning("Approval #%s: auto-rejecting stale KRI value submission: %s", approval_id, e)
        return auto_reject_kri_approval(
            f"KRI value submission no longer passes apply-time validation ({e}).",
        )
    except Exception as exc:
        logger.exception("Unexpected error in KRI value submission approval flow")
        raise ServiceFailure("Internal server error during KRI approval execution") from exc
