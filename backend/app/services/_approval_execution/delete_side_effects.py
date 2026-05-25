import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.services._entity_mutation_lifecycle.archive_plans import (
    archive_control_no_commit,
    archive_kri_no_commit,
    archive_risk_no_commit,
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

        await archive_risk_no_commit(
            db,
            risk=risk,
            current_user=current_user,
            include_changes=True,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        control_result = await db.execute(select(Control).where(Control.id == approval.resource_id).with_for_update())
        control = control_result.scalar_one_or_none()
        if not control:
            return missing_resource_auto_rejection(approval, resource_label="Control", logger=logger)

        await archive_control_no_commit(
            db,
            control=control,
            current_user=current_user,
            include_changes=True,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.KRI:
        kri_result = await db.execute(
            select(KeyRiskIndicator)
            .options(selectinload(KeyRiskIndicator.risk))
            .where(KeyRiskIndicator.id == approval.resource_id)
            .with_for_update()
        )
        kri = kri_result.scalar_one_or_none()
        if not kri:
            return missing_resource_auto_rejection(approval, resource_label="KRI", logger=logger)

        await archive_kri_no_commit(
            db,
            kri=kri,
            current_user=current_user,
            include_changes=True,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()
    return SideEffectResult.applied()
