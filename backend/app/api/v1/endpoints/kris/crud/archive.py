from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.v1.endpoints.approvals._delete_authorization import assert_can_request_delete_kri
from app.core.activity_logger import log_activity
from app.core.datetime_utils import utc_now
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType

router = APIRouter()


@router.delete("/{kri_id}", status_code=202)
async def delete_kri(
    kri_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Request deletion of a KRI.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    from fastapi.responses import Response

    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus

    kri = await assert_can_request_delete_kri(
        db,
        kri_id=kri_id,
        current_user=current_user,
    )

    # Privileged users can archive immediately (no approval needed)
    if can_resolve_approvals(current_user):
        # Archive instead of hard delete (preserves audit trail + history)
        kri.is_archived = True
        kri.archived_at = utc_now()
        kri.archived_by_id = current_user.id

        # Log activity as ARCHIVE (not DELETE - record is preserved)
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=kri.risk.department_id,
        )
        await db.commit()
        return Response(status_code=204)

    # Check for existing pending request
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")

    # Create approval request - ITEM STAYS VISIBLE
    name_snippet = (kri.metric_name or "").strip()[:50]
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=name_snippet or "Unknown KRI",
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
    )
    from app.core.approval_helpers import create_approval_request_with_audit

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=kri.risk.department_id,
        on_duplicate_detail="Deletion request already pending",
    )

    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=202,
        content={
            "message": "Deletion request submitted for approval",
            "approval_id": approval.id,
            "action_type": "delete",
        },
    )
