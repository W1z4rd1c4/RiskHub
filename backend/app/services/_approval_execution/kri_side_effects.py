from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ApprovalRequest, KeyRiskIndicator, User, VendorKRILink

from .kri_generic_edit import _apply_kri_generic_edit
from .kri_history_correction import _apply_kri_history_correction
from .kri_value_submission import _apply_kri_value_submission
from .results import SideEffectResult

logger = logging.getLogger("app.services.approval_execution_service")


class KRIEditKind(str, Enum):
    GENERIC_EDIT = "generic_edit"
    VALUE_SUBMISSION = "value_submission"
    HISTORY_CORRECTION = "history_correction"


KRIEditHandler = Callable[
    [AsyncSession, ApprovalRequest, KeyRiskIndicator, dict, User, int],
    Awaitable[SideEffectResult],
]


def classify_kri_edit_kind(changes: dict) -> KRIEditKind:
    if "history_entry_id" in changes:
        return KRIEditKind.HISTORY_CORRECTION
    if "period_end" in changes and "current_value" in changes:
        return KRIEditKind.VALUE_SUBMISSION
    return KRIEditKind.GENERIC_EDIT


async def _apply_kri_history_correction_by_kind(
    db: AsyncSession,
    approval: ApprovalRequest,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
) -> SideEffectResult:
    return await _apply_kri_history_correction(db, approval, kri, changes, current_user)


KRI_EDIT_HANDLERS: dict[KRIEditKind, KRIEditHandler] = {
    KRIEditKind.GENERIC_EDIT: _apply_kri_generic_edit,
    KRIEditKind.VALUE_SUBMISSION: _apply_kri_value_submission,
    KRIEditKind.HISTORY_CORRECTION: _apply_kri_history_correction_by_kind,
}


async def _apply_edit_kri(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> SideEffectResult:
    """Load the target KRI and dispatch the edit approval side-effect branch."""
    changes = approval.pending_changes
    if not changes:
        return SideEffectResult.applied()

    result = await db.execute(
        select(KeyRiskIndicator)
        .options(
            selectinload(KeyRiskIndicator.risk),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
        .where(KeyRiskIndicator.id == approval.resource_id)
        .with_for_update()
    )
    kri = result.scalar_one_or_none()
    if not kri:
        logger.warning("Approval #%s: KRI %s no longer exists", approval.id, approval.resource_id)
        return SideEffectResult.auto_rejected("Resource was deleted before approval could be applied.")

    edit_kind = classify_kri_edit_kind(changes)
    handler = KRI_EDIT_HANDLERS[edit_kind]
    return await handler(db, approval, kri, changes, current_user, approval.id)
