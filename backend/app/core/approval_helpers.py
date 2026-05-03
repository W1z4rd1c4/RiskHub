"""Helper functions for approval workflow."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Control, ControlRiskLink, Risk
from app.services.outbox import OutboxService

if TYPE_CHECKING:
    from app.models import ApprovalRequest, User


def build_approval_queued_response(
    *,
    message: str,
    approval_id: int,
    action_type: str,
    pending_fields: list[str] | None = None,
    pending_changes: dict | None = None,
    primary_approver_id: int | None = None,
    requires_privileged_approval: bool = False,
):
    from fastapi.responses import JSONResponse

    from app.schemas.approval_request import ApprovalActionTypeEnum, ApprovalQueuedResponse

    payload = ApprovalQueuedResponse(
        message=message,
        approval_id=approval_id,
        action_type=ApprovalActionTypeEnum(action_type),
        pending_fields=pending_fields or [],
        pending_changes=pending_changes,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged_approval,
    )
    return JSONResponse(status_code=202, content=payload.model_dump(mode="json"))


async def get_primary_approver_for_control(
    db: AsyncSession,
    control_id: int,
    requester_id: Optional[int] = None,
) -> Optional[int]:
    """
    Get the primary approver for a Control edit.

    Returns the owner_id of the highest-priority linked Risk.
    Priority is determined by:
    1. is_priority = True (highest priority)
    2. gross_score descending (secondary sort)

    Fallback: department head if no linked risks or no risk owner.
    Self-approval prevention: if requester_id matches a potential approver, skip them.

    Args:
        db: Database session
        control_id: ID of the control being edited
        requester_id: ID of the user requesting the edit (for self-approval prevention)

    Returns:
        User ID of the primary approver, or None if no approver found
    """
    # Get control with department for fallback
    control_result = await db.execute(
        select(Control).options(selectinload(Control.department)).where(Control.id == control_id)
    )
    control = control_result.scalar_one_or_none()
    if not control:
        return None

    # Query linked risks ordered by priority
    # First by is_priority (True first), then by gross_score descending
    linked_risks_result = await db.execute(
        select(Risk)
        .join(ControlRiskLink, ControlRiskLink.risk_id == Risk.id)
        .where(ControlRiskLink.control_id == control_id)
        .order_by(Risk.is_priority.desc(), Risk.gross_score.desc())
    )
    linked_risks = linked_risks_result.scalars().all()

    # Return owner of highest-priority risk (skip self)
    for risk in linked_risks:
        if risk.owner_id:
            if requester_id and risk.owner_id == requester_id:
                continue  # Skip self-approval
            return risk.owner_id

    # Fallback: department head (skip self)
    if control.department and control.department.manager_id:
        if requester_id and control.department.manager_id == requester_id:
            return None  # Force escalation to privileged approvers
        return control.department.manager_id

    return None


async def check_control_requires_privileged_approval(db: AsyncSession, control_id: int) -> bool:
    """
    Check if a control edit requires privileged approval.

    Returns True if control is linked to any high-risk (or priority) risk.

    Args:
        db: Database session
        control_id: ID of the control being edited

    Returns:
        True if privileged approval is required
    """
    from app.core.permissions import is_high_risk_for_approval_async

    # Query linked risks
    linked_risks_result = await db.execute(
        select(Risk)
        .join(ControlRiskLink, ControlRiskLink.risk_id == Risk.id)
        .where(ControlRiskLink.control_id == control_id)
    )

    for risk in linked_risks_result.scalars():
        if await is_high_risk_for_approval_async(risk, db):
            return True

    return False


async def control_privileged_approval_requirements(
    db: AsyncSession,
    control_ids: set[int],
) -> dict[int, bool]:
    """Return whether each control has any linked risk requiring privileged approval."""
    from app.models.global_config import ConfigDefaults, get_config_int

    if not control_ids:
        return {}

    threshold = await get_config_int(db, "high_risk_min_net_score", ConfigDefaults.HIGH_RISK_MIN_NET_SCORE)
    result = await db.execute(
        select(ControlRiskLink.control_id, Risk.is_priority, Risk.net_score)
        .join(Risk, ControlRiskLink.risk_id == Risk.id)
        .where(ControlRiskLink.control_id.in_(control_ids))
    )
    requirements = {control_id: False for control_id in control_ids}
    for control_id, is_priority, net_score in result.all():
        if bool(is_priority) or int(net_score or 0) >= threshold:
            requirements[control_id] = True
    return requirements


async def get_primary_approver_for_risk(
    db: AsyncSession, risk_id: int, requester_id: Optional[int] = None
) -> Optional[int]:
    """
    Get primary approver for a Risk edit, preventing self-approval.

    Args:
        db: Database session
        risk_id: ID of the risk being edited
        requester_id: ID of the user requesting the edit (for self-approval prevention)

    Returns:
        User ID of the primary approver, or None if no approver found
    """

    risk_result = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == risk_id))
    risk = risk_result.scalar_one_or_none()
    if not risk:
        return None

    # Risk owner is primary approver (unless they're the requester)
    if risk.owner_id and risk.owner_id != requester_id:
        return risk.owner_id

    # Fallback: department head (unless they're the requester)
    if risk.department and risk.department.manager_id and risk.department.manager_id != requester_id:
        return risk.department.manager_id

    return None


async def get_risk_delete_approval_metadata(
    db: AsyncSession,
    *,
    risk: Risk,
    requester_id: Optional[int] = None,
) -> tuple[Optional[int], bool]:
    """Return primary-approver routing and privileged escalation for a risk delete request."""
    from app.core.permissions import is_high_risk_for_approval_async

    primary_approver_id = await get_primary_approver_for_risk(db, risk.id, requester_id=requester_id)
    requires_privileged = await is_high_risk_for_approval_async(risk, db)
    return primary_approver_id, requires_privileged


async def get_control_delete_approval_metadata(
    db: AsyncSession,
    *,
    control: Control,
    requester_id: Optional[int] = None,
) -> tuple[Optional[int], bool]:
    """Return primary-approver routing and privileged escalation for a control delete request."""
    primary_approver_id = await get_primary_approver_for_control(db, control.id, requester_id=requester_id)
    requires_privileged = await check_control_requires_privileged_approval(db, control.id)
    return primary_approver_id, requires_privileged


async def create_approval_request_with_audit(
    db: AsyncSession,
    *,
    approval: "ApprovalRequest",
    actor: "User",
    department_id: Optional[int],
    on_duplicate_detail: str = "An approval request is already pending for this action.",
) -> "ApprovalRequest":
    """
    Create an approval request with audit logging and commit.

    This is a focused helper that consolidates the repeated boilerplate for
    creating approval requests:
    1. Add and flush the approval request
    2. Log the APPROVAL/CREATE activity
    3. Commit the transaction
    4. Handle IntegrityError for the ux_approval_pending unique constraint

    Args:
        db: Database session
        approval: The ApprovalRequest to persist (already populated)
        actor: The user creating the request (for activity log)
        department_id: Department ID for activity log scoping
        on_duplicate_detail: Error message if unique constraint is violated

    Returns:
        The persisted ApprovalRequest with ID populated

    Raises:
        HTTPException(409): If a pending approval already exists (unique constraint violation)
    """
    from fastapi import HTTPException, status
    from sqlalchemy.exc import IntegrityError

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    try:
        db.add(approval)
        await db.flush()

        await log_activity(
            db,
            entity_type=ActivityEntityType.APPROVAL,
            entity_id=approval.id,
            entity_name=approval.resource_name,
            action=ActivityAction.CREATE,
            actor=actor,
            department_id=department_id,
        )
        await OutboxService.enqueue(
            db,
            event_type="approval.request_created",
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=f"approval.request_created:{approval.id}:{approval.status.value.lower()}",
            payload={"approval_id": approval.id},
        )
        await db.commit()
        return approval
    except IntegrityError as e:
        await db.rollback()
        if "ux_approval_pending" in str(e).lower() or "unique constraint" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=on_duplicate_detail,
            )
        raise
