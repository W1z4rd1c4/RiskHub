from __future__ import annotations

from app.core.approval_display import approval_resource_label
from app.models import ApprovalRequest
from app.models.user import User
from app.schemas.approval_request import ApprovalRequestRead
from app.services.authorization_capabilities import approval_capabilities

from .contracts import ApprovalQueuePage, ApprovalQueueProjection
from .logging import queue_logger


def build_approval_read(approval: ApprovalRequest, current_user: User) -> ApprovalRequestRead:
    pending_changes = approval.pending_changes
    capabilities = approval_capabilities(approval=approval, current_user=current_user)

    return ApprovalRequestRead.model_validate(
        {
            "id": approval.id,
            "resource_type": approval.resource_type.value,
            "resource_id": approval.resource_id,
            "action_type": approval.action_type.value if approval.action_type else "delete",
            "pending_changes": pending_changes,
            "status": approval.status.value.lower(),
            "reason": approval.reason,
            "requested_by_id": approval.requested_by_id,
            "requested_by_name": approval.requested_by.name if approval.requested_by else None,
            "requested_by_email": approval.requested_by.email if approval.requested_by else None,
            "resolved_by_id": approval.resolved_by_id,
            "resolved_by_name": approval.resolved_by.name if approval.resolved_by else None,
            "resolved_at": approval.resolved_at,
            "resolution_notes": approval.resolution_notes,
            "created_at": approval.created_at,
            "resource_name": approval_resource_label(approval),
            "can_approve": capabilities.can_approve,
            "can_reject": capabilities.can_reject,
            "capabilities": capabilities,
        }
    )


def project_approval_read(approval: ApprovalRequest, current_user: User):
    try:
        return build_approval_read(approval, current_user), None
    except Exception as exc:
        queue_logger.error(f"Skipping corrupted approval request {approval.id}: {exc}")
        return None, str(exc)


def project_approval_queue_item(approval: ApprovalRequest, current_user: User) -> ApprovalQueueProjection:
    item, skipped_reason = project_approval_read(approval, current_user)
    return ApprovalQueueProjection(approval=approval, item=item, skipped_reason=skipped_reason)


def approval_queue_page(
    *,
    approvals: list[ApprovalRequest],
    total: int,
    skip: int,
    limit: int,
    current_user: User,
) -> ApprovalQueuePage:
    projections = [project_approval_queue_item(approval, current_user) for approval in approvals]
    items = [projection.item for projection in projections if projection.item is not None]
    return ApprovalQueuePage(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        skipped_corrupt_payloads=sum(1 for projection in projections if projection.item is None),
    )
