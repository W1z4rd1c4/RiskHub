"""Approval execution service - handles approval logic extracted from endpoints.

This module provides the core business logic for processing approval requests:
- Authorization checks (primary vs privileged approvers)
- Status transitions (PENDING → PENDING_PRIVILEGED → APPROVED)
- Side effects (DELETE archives, EDIT applies pending_changes)
- Activity logging

The endpoint layer (`approvals.py`) handles HTTP concerns, routing, and orchestration.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import can_resolve_approvals
from app.models import (
    ApprovalActionType,
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

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Field Whitelists for Approval Edits
# ---------------------------------------------------------------------------

# Security: Only these fields can be modified via approval pending_changes.
# Prevents injection of id, created_at, created_by_id, etc.
EDITABLE_FIELDS = {
    "risk": {
        "name", "description", "process", "category", "risk_type",
        "gross_probability", "gross_impact", "net_probability", "net_impact",
        "owner_id", "department_id", "status", "mitigations",
    },
    "control": {
        "name", "description", "frequency", "control_type", "effectiveness",
        "control_form", "risk_level", "owner_id", "department_id", "is_active",
        "status", "control_owner_id",
    },
    "kri": {
        "metric_name", "description", "upper_limit", "lower_limit",
        "current_value", "target_value", "reporting_owner_id",
        "measurement_unit", "reporting_frequency",
    },
}


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


async def load_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    """Load an approval with required relationships.

    Raises HTTPException 404 if not found.
    """
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.requested_by),
            selectinload(ApprovalRequest.resolved_by),
            selectinload(ApprovalRequest.primary_approver),
            selectinload(ApprovalRequest.privileged_approver),
        )
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return approval


async def get_approval_department_id(db: AsyncSession, approval: ApprovalRequest) -> int | None:
    """Get the department ID for an approval's resource."""
    if approval.resource_type == ApprovalResourceType.RISK:
        result = await db.execute(select(Risk.department_id).where(Risk.id == approval.resource_id))
        return result.scalar_one_or_none()
    if approval.resource_type == ApprovalResourceType.CONTROL:
        result = await db.execute(select(Control.department_id).where(Control.id == approval.resource_id))
        return result.scalar_one_or_none()
    if approval.resource_type == ApprovalResourceType.KRI:
        result = await db.execute(
            select(Risk.department_id)
            .join(KeyRiskIndicator, KeyRiskIndicator.risk_id == Risk.id)
            .where(KeyRiskIndicator.id == approval.resource_id)
        )
        return result.scalar_one_or_none()
    return None


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


def assert_can_approve(
    approval: ApprovalRequest,
    current_user: User,
) -> tuple[bool, bool]:
    """Check if current_user can approve the given approval.

    Returns:
        Tuple of (is_privileged, is_primary_approver)

    Raises:
        HTTPException 403 if user cannot approve
        HTTPException 400 if approval is not in a pending state
    """
    is_privileged = can_resolve_approvals(current_user)
    is_primary_approver = approval.primary_approver_id == current_user.id

    if approval.status == ApprovalStatus.PENDING:
        if not is_primary_approver and not is_privileged:
            raise HTTPException(
                status_code=403,
                detail="Only the primary approver or a privileged user can approve this request",
            )
    elif approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        if not is_privileged:
            raise HTTPException(
                status_code=403,
                detail="This request requires privileged user approval (CRO/Admin/Risk Manager)",
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve request with status: {approval.status.value}",
        )

    return is_privileged, is_primary_approver


# ---------------------------------------------------------------------------
# Status Transition
# ---------------------------------------------------------------------------


def apply_status_transition(
    approval: ApprovalRequest,
    *,
    current_user: User,
    resolution_notes: Optional[str],
    is_privileged: bool,
    is_primary_approver: bool,
) -> bool:
    """Apply the status transition for an approval.

    Mutates the approval object in place.

    Returns:
        True if side effects (DELETE/EDIT) should be applied,
        False if transitioning to PENDING_PRIVILEGED (no side effects yet).
    """
    if approval.status == ApprovalStatus.PENDING:
        if is_privileged:
            # Privileged user bypasses tiered approval
            approval.status = ApprovalStatus.APPROVED
            approval.resolved_by_id = current_user.id
            approval.resolved_at = utc_now()
            approval.resolution_notes = resolution_notes
            return True
        elif is_primary_approver:
            # Primary approver approving
            approval.primary_approved_at = utc_now()
            if approval.requires_privileged_approval:
                # Move to PENDING_PRIVILEGED
                approval.status = ApprovalStatus.PENDING_PRIVILEGED
                approval.resolution_notes = f"Primary approval by Risk Owner: {resolution_notes}"
                return False
            else:
                # No privileged approval needed, finalize
                approval.status = ApprovalStatus.APPROVED
                approval.resolved_by_id = current_user.id
                approval.resolved_at = utc_now()
                approval.resolution_notes = resolution_notes
                return True

    elif approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        # Privileged user finalizing after primary approval
        approval.status = ApprovalStatus.APPROVED
        approval.privileged_approver_id = current_user.id
        approval.privileged_approved_at = utc_now()
        approval.resolved_by_id = current_user.id
        approval.resolved_at = utc_now()
        approval.resolution_notes = (
            (approval.resolution_notes or "") + f"\nPrivileged approval: {resolution_notes}"
        )
        return True

    # Should not reach here if assert_can_approve was called
    return False


# ---------------------------------------------------------------------------
# Side Effects: DELETE
# ---------------------------------------------------------------------------


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
                (approval.resolution_notes or "") +
                "\nAuto-rejected: Resource was deleted before approval could be applied."
            )
            return

        old_status = risk.status
        risk.status = RiskStatusEnum.archived.value
        await log_activity(
            db,
            entity_type=ActivityEntityType.RISK,
            entity_id=risk.id,
            entity_name=f"{risk.risk_id_code}: {risk.name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=risk.department_id,
            changes=(
                {"status": {"old": old_status, "new": risk.status}}
                if old_status != risk.status
                else None
            ),
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
                (approval.resolution_notes or "") +
                "\nAuto-rejected: Resource was deleted before approval could be applied."
            )
            return

        old_status = control.status
        control.status = ControlStatus.archived.value
        control.updated_by_id = current_user.id
        await log_activity(
            db,
            entity_type=ActivityEntityType.CONTROL,
            entity_id=control.id,
            entity_name=f"{control.name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=control.department_id,
            changes=(
                {"status": {"old": old_status, "new": control.status}}
                if old_status != control.status
                else None
            ),
            description=f"Archived via approval #{approval.id}",
        )

    elif approval.resource_type == ApprovalResourceType.KRI:
        result = await db.execute(
            select(KeyRiskIndicator).where(KeyRiskIndicator.id == approval.resource_id)
        )
        kri = result.scalar_one_or_none()
        if not kri:
            # Orphaned approval - resource was deleted externally
            logger.warning(f"Approval #{approval.id}: KRI {approval.resource_id} no longer exists")
            approval.status = ApprovalStatus.REJECTED
            approval.resolution_notes = (
                (approval.resolution_notes or "") +
                "\nAuto-rejected: Resource was deleted before approval could be applied."
            )
            return

        old_is_archived = kri.is_archived
        kri.is_archived = True
        kri.archived_at = utc_now()
        kri.archived_by_id = current_user.id
        department_id = await get_approval_department_id(db, approval)
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=department_id,
            changes=(
                {"is_archived": {"old": old_is_archived, "new": kri.is_archived}}
                if old_is_archived != kri.is_archived
                else None
            ),
            description=f"Archived via approval #{approval.id}",
        )


# ---------------------------------------------------------------------------
# Side Effects: EDIT – Risk/Control
# ---------------------------------------------------------------------------


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
        if risk:
            allowed_fields = EDITABLE_FIELDS.get("risk", set())
            applied_changes: dict = {}
            rejected_fields: list[str] = []

            for field, vals in changes.items():
                if field not in allowed_fields:
                    rejected_fields.append(field)
                    continue
                if hasattr(risk, field):
                    setattr(risk, field, vals.get("new"))
                    applied_changes[field] = vals

            # Log rejected fields (security audit, no values logged)
            if rejected_fields:
                logger.warning(
                    f"Approval #{approval.id}: Rejected non-whitelisted fields for risk: {rejected_fields}"
                )

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
                await log_activity(
                    db,
                    entity_type=ActivityEntityType.RISK,
                    entity_id=risk.id,
                    entity_name=f"{risk.risk_id_code}: {risk.name}",
                    action=ActivityAction.UPDATE,
                    actor=current_user,
                    department_id=risk.department_id,
                    changes=applied_changes,
                    description=f"Updated via approval #{approval.id}",
                )

    elif approval.resource_type == ApprovalResourceType.CONTROL:
        result = await db.execute(select(Control).where(Control.id == approval.resource_id))
        control = result.scalar_one_or_none()
        if control:
            allowed_fields = EDITABLE_FIELDS.get("control", set())
            applied_changes: dict = {}
            rejected_fields: list[str] = []

            for field, vals in changes.items():
                if field not in allowed_fields:
                    rejected_fields.append(field)
                    continue
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
                await log_activity(
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


# ---------------------------------------------------------------------------
# Side Effects: EDIT – KRI (3 distinct branches)
# ---------------------------------------------------------------------------


async def _apply_edit_kri(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> None:
    """Apply pending_changes to KRI.

    Three distinct flows based on pending_changes shape:
    1. History correction: `history_entry_id` present
    2. Value submission: `period_end` and `current_value` present
    3. Generic edit: everything else (+ optional value recording)
    """
    changes = approval.pending_changes
    if not changes:
        return

    result = await db.execute(
        select(KeyRiskIndicator)
        .options(selectinload(KeyRiskIndicator.risk))
        .where(KeyRiskIndicator.id == approval.resource_id)
    )
    kri = result.scalar_one_or_none()
    if not kri:
        return

    department_id = kri.risk.department_id if kri.risk else None

    # Branch 1: History correction
    if "history_entry_id" in changes:
        await _apply_kri_history_correction(db, kri, changes, current_user, approval.id, department_id)

    # Branch 2: Value submission with period_end
    elif "period_end" in changes and "current_value" in changes:
        await _apply_kri_value_submission(db, kri, changes, current_user, approval.id, department_id)

    # Branch 3: Generic edit (+ optional value recording)
    else:
        await _apply_kri_generic_edit(db, kri, changes, current_user, approval.id, department_id)


async def _apply_kri_history_correction(
    db: AsyncSession,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> None:
    """Apply history correction to a KRI history entry."""
    from app.services.kri_history_service import KRIHistoryService

    entry_id = changes.get("history_entry_id")
    new_value = changes.get("new_value")
    old_value = changes.get("old_value")

    if entry_id is None or new_value is None:
        raise HTTPException(status_code=400, detail="Invalid KRI history correction payload")

    # Capture current KRI state for change tracking
    old_kri_current_value = kri.current_value
    old_kri_last_period_end = kri.last_period_end
    old_kri_last_reported_at = kri.last_reported_at

    logger.info(f"Applying KRI history correction: entry {entry_id}, val {new_value}")

    try:
        updated_entry = await KRIHistoryService.apply_history_correction(
            db=db,
            entry_id=entry_id,
            new_value=new_value,
            corrected_by_id=current_user.id,
        )

        # Log KRI_VALUE activity
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI_VALUE,
            entity_id=entry_id,
            entity_name=f"{kri.metric_name} ({updated_entry.period_end.isoformat()})",
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=department_id,
            changes={"value": {"old": old_value, "new": new_value}},
            description=f"Corrected via approval #{approval_id}",
        )

        # Log KRI changes if any
        kri_changes = _build_kri_changes(
            kri, old_kri_current_value, old_kri_last_period_end, old_kri_last_reported_at
        )
        if kri_changes:
            await log_activity(
                db,
                entity_type=ActivityEntityType.KRI,
                entity_id=kri.id,
                entity_name=f"{kri.metric_name}",
                action=ActivityAction.UPDATE,
                actor=current_user,
                department_id=department_id,
                changes=kri_changes,
                description=f"Updated via approval #{approval_id} (history correction)",
            )

    except ValueError as e:
        logger.error(f"KRI history correction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in KRI history correction: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


async def _apply_kri_value_submission(
    db: AsyncSession,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> None:
    """Apply value submission (new history entry) to a KRI."""
    from datetime import date as date_type

    from app.services.kri_history_service import KRIHistoryService

    value_change = changes.get("current_value")
    period_end_str = changes.get("period_end")
    recorded_at_str = changes.get("recorded_at")

    if value_change is None or period_end_str is None:
        raise HTTPException(status_code=400, detail="Invalid KRI value submission payload")

    period_end = date_type.fromisoformat(period_end_str)
    recorded_at = datetime.fromisoformat(recorded_at_str) if recorded_at_str else None

    # Capture current KRI state
    old_kri_current_value = kri.current_value
    old_kri_last_period_end = kri.last_period_end
    old_kri_last_reported_at = kri.last_reported_at

    try:
        logger.info(f"Recording KRI value for approval: {value_change.get('new')}")
        history_entry = await KRIHistoryService.record_value(
            db=db,
            kri=kri,
            value=value_change.get("new"),
            recorded_by_id=current_user.id,
            recorded_at=recorded_at,
            period_end=period_end,
            is_privileged=True,
        )

        # Log KRI_VALUE creation
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI_VALUE,
            entity_id=history_entry.id,
            entity_name=f"{kri.metric_name} ({history_entry.period_end.isoformat()})",
            action=ActivityAction.CREATE,
            actor=current_user,
            department_id=department_id,
            changes={
                "value": {"old": value_change.get("old"), "new": value_change.get("new")},
                "period_end": {"old": None, "new": period_end.isoformat()},
            },
            description=f"Recorded via approval #{approval_id}",
        )

        # Log KRI changes if any
        kri_changes = _build_kri_changes(
            kri, old_kri_current_value, old_kri_last_period_end, old_kri_last_reported_at
        )
        if kri_changes:
            await log_activity(
                db,
                entity_type=ActivityEntityType.KRI,
                entity_id=kri.id,
                entity_name=f"{kri.metric_name}",
                action=ActivityAction.UPDATE,
                actor=current_user,
                department_id=department_id,
                changes=kri_changes,
                description=f"Updated via approval #{approval_id} (value submission)",
            )

    except ValueError as e:
        logger.error(f"KRI value recording failed (submit): {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in KRI value recording: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


async def _apply_kri_generic_edit(
    db: AsyncSession,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> None:
    """Apply generic field edits to a KRI, with optional value recording."""
    from app.services.kri_history_service import KRIHistoryService

    value_change = changes.get("current_value")
    allowed_fields = EDITABLE_FIELDS.get("kri", set())
    applied_changes: dict = {}
    rejected_fields: list[str] = []

    # Apply non-value field changes with whitelist enforcement
    for field, vals in changes.items():
        if field == "current_value":
            continue  # Handled separately by KRIHistoryService
        if field not in allowed_fields:
            rejected_fields.append(field)
            continue
        if hasattr(kri, field):
            setattr(kri, field, vals.get("new"))
            applied_changes[field] = vals

    # Log rejected fields (security audit, no values logged)
    if rejected_fields:
        logger.warning(
            f"Approval #{approval_id}: Rejected non-whitelisted fields for KRI: {rejected_fields}"
        )

    # Handle optional value recording
    if value_change is not None:
        old_kri_current_value = kri.current_value
        old_kri_last_period_end = kri.last_period_end
        old_kri_last_reported_at = kri.last_reported_at

        try:
            history_entry = await KRIHistoryService.record_value(
                db=db,
                kri=kri,
                value=value_change.get("new"),
                recorded_by_id=current_user.id,
                is_privileged=True,
            )

            # Log KRI_VALUE creation
            await log_activity(
                db,
                entity_type=ActivityEntityType.KRI_VALUE,
                entity_id=history_entry.id,
                entity_name=f"{kri.metric_name} ({history_entry.period_end.isoformat()})",
                action=ActivityAction.CREATE,
                actor=current_user,
                department_id=department_id,
                changes={
                    "value": {"old": value_change.get("old"), "new": value_change.get("new")},
                    "period_end": {"old": None, "new": history_entry.period_end.isoformat()},
                },
                description=f"Recorded via approval #{approval_id}",
            )

            # Track KRI field changes from value recording
            if old_kri_current_value != kri.current_value:
                applied_changes["current_value"] = {
                    "old": old_kri_current_value,
                    "new": kri.current_value,
                }
            if old_kri_last_period_end != kri.last_period_end:
                applied_changes["last_period_end"] = {
                    "old": old_kri_last_period_end,
                    "new": kri.last_period_end,
                }
            if old_kri_last_reported_at != kri.last_reported_at:
                applied_changes["last_reported_at"] = {
                    "old": old_kri_last_reported_at,
                    "new": kri.last_reported_at,
                }

        except ValueError as e:
            logger.error(f"Failed to record value during approval: {str(e)}")
            raise HTTPException(status_code=400, detail=f"KRI value recording failed: {str(e)}")

    # Log KRI field changes
    if applied_changes:
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=department_id,
            changes=applied_changes,
            description=f"Updated via approval #{approval_id}",
        )


def _build_kri_changes(
    kri: KeyRiskIndicator,
    old_current_value,
    old_last_period_end,
    old_last_reported_at,
) -> dict:
    """Build a changes dict for KRI field tracking."""
    changes: dict[str, dict[str, object]] = {}
    if old_current_value != kri.current_value:
        changes["current_value"] = {"old": old_current_value, "new": kri.current_value}
    if old_last_period_end != kri.last_period_end:
        changes["last_period_end"] = {"old": old_last_period_end, "new": kri.last_period_end}
    if old_last_reported_at != kri.last_reported_at:
        changes["last_reported_at"] = {"old": old_last_reported_at, "new": kri.last_reported_at}
    return changes


# ---------------------------------------------------------------------------
# Side Effects: Main Entry Point
# ---------------------------------------------------------------------------


async def apply_side_effects(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> None:
    """Apply the side effects for an approved request.

    - DELETE: archive the resource
    - EDIT: apply pending_changes to the resource
    """
    if approval.action_type == ApprovalActionType.DELETE:
        await _apply_delete_side_effects(db, approval, current_user)

    elif approval.action_type == ApprovalActionType.EDIT:
        if approval.resource_type in (ApprovalResourceType.RISK, ApprovalResourceType.CONTROL):
            await _apply_edit_risk_control(db, approval, current_user)
        elif approval.resource_type == ApprovalResourceType.KRI:
            await _apply_edit_kri(db, approval, current_user)


# ---------------------------------------------------------------------------
# Activity Logging
# ---------------------------------------------------------------------------


async def log_approval_approve(
    db: AsyncSession,
    approval: ApprovalRequest,
    actor: User,
    previous_status: ApprovalStatus,
) -> None:
    """Log the final APPROVE action for an approval request."""
    department_id = await get_approval_department_id(db, approval)
    await log_activity(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval.resource_name or f"{approval.resource_type.value}-{approval.resource_id}",
        action=ActivityAction.APPROVE,
        actor=actor,
        department_id=department_id,
        changes={"status": {"old": previous_status.value, "new": approval.status.value}},
    )
