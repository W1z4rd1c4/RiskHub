import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.owner_reference_validation import validate_active_owner_reference
from app.models import ApprovalRequest, ApprovalResourceType, Control, Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType

from .constants import EDITABLE_FIELDS
from .results import SideEffectResult
from .staleness import reject_if_stale_pending_change

logger = logging.getLogger("app.services.approval_execution_service")


async def _apply_edit_risk_control(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> SideEffectResult:
    """Apply pending_changes to Risk or Control.

    For risks: also recomputes derived scores (gross_score, net_score) if probability/impact changed.
    For controls: also sets updated_by_id for audit attribution.
    """
    changes = approval.pending_changes
    if not changes:
        return SideEffectResult.applied()

    if approval.resource_type == ApprovalResourceType.RISK:
        risk_result = await db.execute(select(Risk).where(Risk.id == approval.resource_id))
        risk = risk_result.scalar_one_or_none()
        if not risk:
            logger.warning("Approval #%s: Risk %s no longer exists", approval.id, approval.resource_id)
            return SideEffectResult.auto_rejected("Resource was deleted before approval could be applied.")
        if risk:
            allowed_fields = EDITABLE_FIELDS.get("risk", set())
            risk_applied_changes: dict = {}
            risk_rejected_fields: list[str] = []

            stale_result = reject_if_stale_pending_change(
                approval,
                target=risk,
                changes=changes,
                allowed_fields=allowed_fields,
            )
            if stale_result is not None:
                return stale_result

            for field, vals in changes.items():
                if field not in allowed_fields:
                    risk_rejected_fields.append(field)
                    continue
                if field == "owner_id":
                    await validate_active_owner_reference(
                        db,
                        user_id=vals.get("new"),
                        label="Risk owner",
                    )
                if hasattr(risk, field):
                    setattr(risk, field, vals.get("new"))
                    risk_applied_changes[field] = vals

            # Log rejected fields (security audit, no values logged)
            if risk_rejected_fields:
                logger.warning(
                    f"Approval #{approval.id}: Rejected non-whitelisted fields for risk: {risk_rejected_fields}"
                )

            # Recompute derived scores if probability/impact changed
            gross_inputs_changed = any(k in risk_applied_changes for k in ("gross_probability", "gross_impact"))
            net_inputs_changed = any(k in risk_applied_changes for k in ("net_probability", "net_impact"))

            if gross_inputs_changed:
                old_gross_score = risk.gross_score
                risk.gross_score = risk.gross_probability * risk.gross_impact
                if risk.gross_score != old_gross_score:
                    risk_applied_changes["gross_score"] = {"old": old_gross_score, "new": risk.gross_score}

            if net_inputs_changed:
                old_net_score = risk.net_score
                risk.net_score = risk.net_probability * risk.net_impact
                if risk.net_score != old_net_score:
                    risk_applied_changes["net_score"] = {"old": old_net_score, "new": risk.net_score}

            if risk_applied_changes:
                await activity_logger.log_activity(
                    db,
                    entity_type=ActivityEntityType.RISK,
                    entity_id=risk.id,
                    entity_name=f"{risk.risk_id_code}: {risk.name}",
                    safe_entity_label=risk.risk_id_code,
                    action=ActivityAction.UPDATE,
                    actor=current_user,
                    department_id=risk.department_id,
                    changes=risk_applied_changes,
                    description=f"Updated via approval #{approval.id}",
                )
            return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        control_result = await db.execute(select(Control).where(Control.id == approval.resource_id))
        control = control_result.scalar_one_or_none()
        if not control:
            logger.warning("Approval #%s: Control %s no longer exists", approval.id, approval.resource_id)
            return SideEffectResult.auto_rejected("Resource was deleted before approval could be applied.")
        if control:
            allowed_fields = EDITABLE_FIELDS.get("control", set())
            control_applied_changes: dict = {}
            control_rejected_fields: list[str] = []

            stale_result = reject_if_stale_pending_change(
                approval,
                target=control,
                changes=changes,
                allowed_fields=allowed_fields,
            )
            if stale_result is not None:
                return stale_result

            for field, vals in changes.items():
                if field not in allowed_fields:
                    control_rejected_fields.append(field)
                    continue
                if field == "control_owner_id":
                    await validate_active_owner_reference(
                        db,
                        user_id=vals.get("new"),
                        label="Control owner",
                    )
                if hasattr(control, field):
                    setattr(control, field, vals.get("new"))
                    control_applied_changes[field] = vals

            # Log rejected fields (security audit, no values logged)
            if control_rejected_fields:
                logger.warning(
                    f"Approval #{approval.id}: Rejected non-whitelisted fields for control: {control_rejected_fields}"
                )

            # Set audit attribution for control edits
            if control_applied_changes:
                control.updated_by_id = current_user.id
                await activity_logger.log_activity(
                    db,
                    entity_type=ActivityEntityType.CONTROL,
                    entity_id=control.id,
                    entity_name=f"{control.name}",
                    action=ActivityAction.UPDATE,
                    actor=current_user,
                    department_id=control.department_id,
                    changes=control_applied_changes,
                    description=f"Updated via approval #{approval.id}",
                )
            return SideEffectResult.applied()
    return SideEffectResult.applied()
