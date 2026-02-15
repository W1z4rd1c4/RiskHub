from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.risk import RiskStatusEnum

router = APIRouter()


@router.delete("/{risk_id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_risk(
    risk_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """
    Request deletion of a risk.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    from fastapi.responses import Response

    from app.core.permissions import can_resolve_approvals, check_department_access
    from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()

    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    # Allow risk owners to request deletion regardless of department (cross-department access)
    # per BUSINESS_LOGIC.md §7.1
    is_owner = risk.owner_id == current_user.id
    if not is_owner:
        # Verify department access only for non-owners
        check_department_access(risk.department_id, current_user)

    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        risk.status = RiskStatusEnum.archived.value

        # Log activity within the same transaction
        await log_activity(
            db,
            entity_type=ActivityEntityType.RISK,
            entity_id=risk.id,
            entity_name=f"{risk.risk_id_code}",
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

    # Determine primary approver: Risk Owner (if not self)
    primary_approver_id = risk.owner_id if risk.owner_id != current_user.id else None

    # Fallback to department head if no owner or self-approval
    if not primary_approver_id and risk.department_id:
        from app.models import Department

        dept_result = await db.execute(select(Department).where(Department.id == risk.department_id))
        dept = dept_result.scalar_one_or_none()
        if dept and dept.manager_id and dept.manager_id != current_user.id:
            primary_approver_id = dept.manager_id

    # Determine if privileged approval is needed (priority risks)
    requires_privileged = bool(risk.is_priority)

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

    from app.core.approval_helpers import create_approval_request_with_audit

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

