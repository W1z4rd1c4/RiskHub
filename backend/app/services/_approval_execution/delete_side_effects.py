import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.datetime_utils import utc_now
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.control import ControlStatus
from app.models.risk import RiskStatus as RiskStatusEnum

from .helpers import missing_resource_auto_rejection
from .loading import get_approval_department_id
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
        risk_result = await db.execute(select(Risk).where(Risk.id == approval.resource_id))
        risk = risk_result.scalar_one_or_none()
        if not risk:
            return missing_resource_auto_rejection(approval, resource_label="Risk", logger=logger)

        old_status = risk.status
        risk.status = RiskStatusEnum.archived.value
        await activity_logger.log_activity(
            db,
            entity_type=ActivityEntityType.RISK,
            entity_id=risk.id,
            entity_name=f"{risk.risk_id_code}: {risk.name}",
            safe_entity_label=risk.risk_id_code,
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=risk.department_id,
            changes={"status": {"old": old_status, "new": risk.status}} if old_status != risk.status else None,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        control_result = await db.execute(select(Control).where(Control.id == approval.resource_id))
        control = control_result.scalar_one_or_none()
        if not control:
            return missing_resource_auto_rejection(approval, resource_label="Control", logger=logger)

        old_status = control.status
        control.status = ControlStatus.archived.value
        control.updated_by_id = current_user.id
        await activity_logger.log_activity(
            db,
            entity_type=ActivityEntityType.CONTROL,
            entity_id=control.id,
            entity_name=f"{control.name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=control.department_id,
            changes={"status": {"old": old_status, "new": control.status}} if old_status != control.status else None,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.KRI:
        kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == approval.resource_id))
        kri = kri_result.scalar_one_or_none()
        if not kri:
            return missing_resource_auto_rejection(approval, resource_label="KRI", logger=logger)

        old_is_archived = kri.is_archived
        kri.is_archived = True
        kri.archived_at = utc_now()
        kri.archived_by_id = current_user.id
        department_id = await get_approval_department_id(db, approval)
        await activity_logger.log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            safe_entity_label=kri.metric_name,
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=department_id,
            changes={"is_archived": {"old": old_is_archived, "new": kri.is_archived}}
            if old_is_archived != kri.is_archived
            else None,
            description=f"Archived via approval #{approval.id}",
        )
        return SideEffectResult.applied()
    return SideEffectResult.applied()
