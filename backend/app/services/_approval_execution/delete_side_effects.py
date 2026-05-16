import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.audit.control import control_archived
from app.core.audit.kri import kri_archived
from app.core.audit.risk import risk_archived
from app.core.datetime_utils import utc_now
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)

from .helpers import missing_resource_auto_rejection
from .results import SideEffectResult

logger = logging.getLogger("app.services.approval_execution_service")


async def _apply_delete_side_effects(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> SideEffectResult:
    """Archive the resource for a DELETE approval.

    If the resource no longer exists (orphaned approval), the approval is marked
    as REJECTED with an explanatory note for audit purposes.
    """
    if approval.resource_type == ApprovalResourceType.RISK:
        risk_result = await db.execute(select(Risk).where(Risk.id == approval.resource_id).with_for_update())
        risk = risk_result.scalar_one_or_none()
        if not risk:
            return missing_resource_auto_rejection(approval, resource_label="Risk", logger=logger)

        old_is_archived = risk.is_archived
        risk.mark_archived(current_user)
        risk_changes: dict[str, dict[str, object]] = {}
        if old_is_archived != risk.is_archived:
            risk_changes["is_archived"] = {"old": old_is_archived, "new": risk.is_archived}
        await risk_archived(
            db,
            actor=current_user,
            risk=risk,
            changes=risk_changes or None,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        control_result = await db.execute(select(Control).where(Control.id == approval.resource_id).with_for_update())
        control = control_result.scalar_one_or_none()
        if not control:
            return missing_resource_auto_rejection(approval, resource_label="Control", logger=logger)

        old_is_archived = control.is_archived
        control.mark_archived(current_user)
        control.updated_by_id = current_user.id
        control_changes: dict[str, dict[str, object]] = {}
        if old_is_archived != control.is_archived:
            control_changes["is_archived"] = {"old": old_is_archived, "new": control.is_archived}
        await control_archived(
            db,
            actor=current_user,
            control=control,
            changes=control_changes or None,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.KRI:
        kri_result = await db.execute(
            select(KeyRiskIndicator)
            .options(joinedload(KeyRiskIndicator.risk))
            .where(KeyRiskIndicator.id == approval.resource_id)
            .with_for_update()
        )
        kri = kri_result.scalar_one_or_none()
        if not kri:
            return missing_resource_auto_rejection(approval, resource_label="KRI", logger=logger)

        old_is_archived = kri.is_archived
        now = utc_now()
        kri.mark_archived(current_user, when=now)
        await kri_archived(
            db,
            actor=current_user,
            kri=kri,
            changes={"is_archived": {"old": old_is_archived, "new": kri.is_archived}}
            if old_is_archived != kri.is_archived
            else None,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()
    return SideEffectResult.applied()
