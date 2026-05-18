from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc
from app.core.exceptions import ServiceFailure, ValidationError
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.services._kri_history.approval_execution import apply_approved_kri_value_submission

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

    value_change = changes.get("current_value")
    period_end_str = _pending_change_new(changes.get("period_end"))
    recorded_at_str = _pending_change_new(changes.get("recorded_at"))

    if value_change is None or period_end_str is None:
        raise ValidationError("Invalid KRI value submission payload")

    new_value = value_change.get("new")
    old_value = value_change.get("old")
    period_end = date_type.fromisoformat(period_end_str)
    recorded_at = coerce_utc(datetime.fromisoformat(recorded_at_str)) if recorded_at_str else None

    try:
        logger.info("Recording KRI value for approval: %s", new_value)
        await apply_approved_kri_value_submission(
            db=db,
            kri=kri,
            value=new_value,
            old_value=old_value,
            recorded_by=current_user,
            recorded_at=recorded_at,
            period_end=period_end,
            approval_id=approval_id,
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
