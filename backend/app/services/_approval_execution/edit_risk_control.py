import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.owner_reference_validation import validate_active_owner_reference
from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus, Control, Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType

from .constants import EDITABLE_FIELDS

logger = logging.getLogger("app.services.approval_execution_service")


async def _apply_edit_risk_control(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> None:
    """Apply pending_changes to Risk or Control.

    For risks: also recomputes derived scores (gross_score, net_score) if probability/impact changed.
    For controls: also sets updated_by_id for audit attribution.
    """
    changes = approval.pending_changes
    if not changes:
        return

    if approval.resource_type == ApprovalResourceType.RISK:
        result = await db.execute(select(Risk).where(Risk.id == approval.resource_id))
        risk = result.scalar_one_or_none()
        if not risk:
            logger.warning("Approval #%s: Risk %s no longer exists", approval.id, approval.resource_id)
            approval.status = ApprovalStatus.REJECTED
            approval.resolution_notes = (
                approval.resolution_notes or ""
            ) + "\nAuto-rejected: Resource was deleted before approval could be applied."
            return
        if risk:
            allowed_fields = EDITABLE_FIELDS.get("risk", set())
            applied_changes: dict = {}
            rejected_fields: list[str] = []

            for field, vals in changes.items():
                if field not in allowed_fields:
                    rejected_fields.append(field)
                    continue
                if field == "owner_id":
                    await validate_active_owner_reference(
                        db,
                        user_id=vals.get("new"),
                        label="Risk owner",
                    )
                if hasattr(risk, field):
                    setattr(risk, field, vals.get("new"))
                    applied_changes[field] = vals

            # Log rejected fields (security audit, no values logged)
            if rejected_fields:
                logger.warning(f"Approval #{approval.id}: Rejected non-whitelisted fields for risk: {rejected_fields}")

            # Recompute derived scores if probability/impact changed
            gross_inputs_changed = any(k in applied_changes for k in ("gross_probability", "gross_impact"))
            net_inputs_changed = any(k in applied_changes for k in ("net_probability", "net_impact"))

            if gross_inputs_changed:
                old_gross_score = risk.gross_score
                risk.gross_score = risk.gross_probability * risk.gross_impact
                if risk.gross_score != old_gross_score:
                    applied_changes["gross_score"] = {"old": old_gross_score, "new": risk.gross_score}

            if net_inputs_changed:
                old_net_score = risk.net_score
                risk.net_score = risk.net_probability * risk.net_impact
                if risk.net_score != old_net_score:
                    applied_changes["net_score"] = {"old": old_net_score, "new": risk.net_score}

            if applied_changes:
                await activity_logger.log_activity(
                    db,
                    entity_type=ActivityEntityType.RISK,
                    entity_id=risk.id,
                    entity_name=f"{risk.risk_id_code}: {risk.name}",
                    safe_entity_label=risk.risk_id_code,
                    action=ActivityAction.UPDATE,
                    actor=current_user,
                    department_id=risk.department_id,
                    changes=applied_changes,
                    description=f"Updated via approval #{approval.id}",
                )

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        result = await db.execute(select(Control).where(Control.id == approval.resource_id))
        control = result.scalar_one_or_none()
        if not control:
            logger.warning("Approval #%s: Control %s no longer exists", approval.id, approval.resource_id)
            approval.status = ApprovalStatus.REJECTED
            approval.resolution_notes = (
                approval.resolution_notes or ""
            ) + "\nAuto-rejected: Resource was deleted before approval could be applied."
            return
        if control:
            allowed_fields = EDITABLE_FIELDS.get("control", set())
            applied_changes: dict = {}
            rejected_fields: list[str] = []

            for field, vals in changes.items():
                if field not in allowed_fields:
                    rejected_fields.append(field)
                    continue
                if field == "control_owner_id":
                    await validate_active_owner_reference(
                        db,
                        user_id=vals.get("new"),
                        label="Control owner",
                    )
                if hasattr(control, field):
                    setattr(control, field, vals.get("new"))
                    applied_changes[field] = vals

            # Log rejected fields (security audit, no values logged)
            if rejected_fields:
                logger.warning(
                    f"Approval #{approval.id}: Rejected non-whitelisted fields for control: {rejected_fields}"
                )

            # Set audit attribution for control edits
            if applied_changes:
                control.updated_by_id = current_user.id
                await activity_logger.log_activity(
                    db,
                    entity_type=ActivityEntityType.CONTROL,
                    entity_id=control.id,
                    entity_name=f"{control.name}",
                    action=ActivityAction.UPDATE,
                    actor=current_user,
                    department_id=control.department_id,
                    changes=applied_changes,
                    description=f"Updated via approval #{approval.id}",
                )
