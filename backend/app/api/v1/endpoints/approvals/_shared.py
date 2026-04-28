from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_display import approval_resource_label
from app.models import ApprovalRequest, ApprovalResourceType, Control, KeyRiskIndicator, Risk
from app.models.user import User
from app.schemas.approval_request import ApprovalRequestRead
from app.services.authorization_capabilities import approval_capabilities

logger = logging.getLogger("app.api.v1.endpoints.approvals")


async def _get_approval_department_id(db: AsyncSession, approval: ApprovalRequest) -> int | None:
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


def _build_approval_read(approval: ApprovalRequest, current_user: User) -> ApprovalRequestRead:
    """Build ApprovalRequestRead dict from model with user names."""
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
