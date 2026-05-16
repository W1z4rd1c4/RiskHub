import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.audit.control import control_updated
from app.core.audit.risk import risk_updated
from app.models import ApprovalRequest, ApprovalResourceType, Control, Risk, User

from .constants import EDITABLE_FIELDS
from .helpers import apply_whitelisted_pending_changes, missing_resource_auto_rejection
from .results import SideEffectResult

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
        risk_result = await db.execute(select(Risk).where(Risk.id == approval.resource_id).with_for_update())
        risk = risk_result.scalar_one_or_none()
        if not risk:
            return missing_resource_auto_rejection(approval, resource_label="Risk", logger=logger)
        if risk:
            allowed_fields = EDITABLE_FIELDS.get("risk", set())
            field_changes = await apply_whitelisted_pending_changes(
                db,
                approval=approval,
                target=risk,
                changes=changes,
                allowed_fields=allowed_fields,
                owner_field_labels={"owner_id": "Risk owner"},
            )
            if field_changes.stale_result is not None:
                return field_changes.stale_result
            risk_applied_changes = field_changes.applied_changes
            risk_rejected_fields = field_changes.rejected_fields

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
                await risk_updated(
                    db,
                    actor=current_user,
                    risk=risk,
                    changes=risk_applied_changes,
                    description=f"Updated via approval #{approval.id}",
                    log_activity_func=activity_logger.log_activity,
                )
            return SideEffectResult.applied()

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        control_result = await db.execute(select(Control).where(Control.id == approval.resource_id).with_for_update())
        control = control_result.scalar_one_or_none()
        if not control:
            return missing_resource_auto_rejection(approval, resource_label="Control", logger=logger)
        if control:
            allowed_fields = EDITABLE_FIELDS.get("control", set())
            field_changes = await apply_whitelisted_pending_changes(
                db,
                approval=approval,
                target=control,
                changes=changes,
                allowed_fields=allowed_fields,
                owner_field_labels={"control_owner_id": "Control owner"},
            )
            if field_changes.stale_result is not None:
                return field_changes.stale_result
            control_applied_changes = field_changes.applied_changes
            control_rejected_fields = field_changes.rejected_fields

            # Log rejected fields (security audit, no values logged)
            if control_rejected_fields:
                logger.warning(
                    f"Approval #{approval.id}: Rejected non-whitelisted fields for control: {control_rejected_fields}"
                )

            # Set audit attribution for control edits
            if control_applied_changes:
                control.updated_by_id = current_user.id
                await control_updated(
                    db,
                    actor=current_user,
                    control=control,
                    changes=control_applied_changes,
                    description=f"Updated via approval #{approval.id}",
                    log_activity_func=activity_logger.log_activity,
                )
            return SideEffectResult.applied()
    return SideEffectResult.applied()
