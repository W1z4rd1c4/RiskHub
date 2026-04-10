import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.datetime_utils import utc_now
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.control import ControlStatus
from app.models.risk import RiskStatus as RiskStatusEnum

from .loading import get_approval_department_id

logger = logging.getLogger("app.services.approval_execution_service")


async def _apply_delete_side_effects(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> None:
    """Archive the resource for a DELETE approval.

    If the resource no longer exists (orphaned approval), the approval is marked
    as REJECTED with an explanatory note for audit purposes.
    """
    if approval.resource_type == ApprovalResourceType.RISK:
        result = await db.execute(select(Risk).where(Risk.id == approval.resource_id))
        risk = result.scalar_one_or_none()
        if not risk:
            # Orphaned approval - resource was deleted externally
            logger.warning(f"Approval #{approval.id}: Risk {approval.resource_id} no longer exists")
            approval.status = ApprovalStatus.REJECTED
            approval.resolution_notes = (
                approval.resolution_notes or ""
            ) + "\nAuto-rejected: Resource was deleted before approval could be applied."
            return

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

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        result = await db.execute(select(Control).where(Control.id == approval.resource_id))
        control = result.scalar_one_or_none()
        if not control:
            # Orphaned approval - resource was deleted externally
            logger.warning(f"Approval #{approval.id}: Control {approval.resource_id} no longer exists")
            approval.status = ApprovalStatus.REJECTED
            approval.resolution_notes = (
                approval.resolution_notes or ""
            ) + "\nAuto-rejected: Resource was deleted before approval could be applied."
            return

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

    elif approval.resource_type == ApprovalResourceType.KRI:
        result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == approval.resource_id))
        kri = result.scalar_one_or_none()
        if not kri:
            # Orphaned approval - resource was deleted externally
            logger.warning(f"Approval #{approval.id}: KRI {approval.resource_id} no longer exists")
            approval.status = ApprovalStatus.REJECTED
            approval.resolution_notes = (
                approval.resolution_notes or ""
            ) + "\nAuto-rejected: Resource was deleted before approval could be applied."
            return

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
