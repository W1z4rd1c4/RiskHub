from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.v1.endpoints.approvals._delete_authorization import assert_can_request_delete_risk
from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.risk import RiskStatusEnum

router = APIRouter()


@router.delete("/{risk_id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_risk(
    risk_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Request deletion of a risk.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    from fastapi.responses import Response

    from app.core.approval_helpers import create_approval_request_with_audit, get_risk_delete_approval_metadata
    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus

    risk = await assert_can_request_delete_risk(
        db,
        risk_id=risk_id,
        current_user=current_user,
    )

    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        risk.status = RiskStatusEnum.archived.value

        # Log activity within the same transaction
        await log_activity(
            db,
            entity_type=ActivityEntityType.RISK,
            entity_id=risk.id,
            entity_name=f"{risk.risk_id_code}",
            safe_entity_label=risk.risk_id_code,
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=risk.department_id,
        )
        await db.commit()

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Check for existing pending request (both PENDING and PENDING_PRIVILEGED)
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            ApprovalRequest.resource_id == risk.id,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")

    # Create approval request - ITEM STAYS VISIBLE
    # Store risk name and description for better workflow display
    desc_snippet = (
        (risk.description[:100] + "...")
        if risk.description and len(risk.description) > 100
        else (risk.description or "")
    )

    primary_approver_id, requires_privileged = await get_risk_delete_approval_metadata(
        db,
        risk=risk,
        requester_id=current_user.id,
    )
    # Delete escalation must stay aligned with the shared high-risk rule and config threshold.

    from app.models import ApprovalActionType

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,  # Use risk name for display
        requested_by_id=current_user.id,
        reason=f"{reason}\n\nDescription: {desc_snippet}" if desc_snippet else reason,
        status=ApprovalStatus.PENDING,
        action_type=ApprovalActionType.DELETE,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=risk.department_id,
    )

    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "message": "Deletion request submitted for approval",
            "approval_id": approval.id,
            "action_type": "delete",
        },
    )
