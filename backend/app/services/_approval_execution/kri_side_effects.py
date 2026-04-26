from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ApprovalRequest, KeyRiskIndicator, User, VendorKRILink

from .kri_generic_edit import _apply_kri_generic_edit
from .kri_history_correction import _apply_kri_history_correction
from .kri_value_submission import _apply_kri_value_submission
from .results import SideEffectResult

logger = logging.getLogger("app.services.approval_execution_service")


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

    department_id = kri.risk.department_id if kri.risk else None

    if "history_entry_id" in changes:
        return await _apply_kri_history_correction(db, approval, kri, changes, current_user, department_id)

    if "period_end" in changes and "current_value" in changes:
        return await _apply_kri_value_submission(db, approval, kri, changes, current_user, approval.id, department_id)

    return await _apply_kri_generic_edit(db, approval, kri, changes, current_user, approval.id, department_id)
