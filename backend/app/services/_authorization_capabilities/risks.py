from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    can_access_department_id,
    can_read_risk_id,
    can_resolve_approvals,
    has_permission,
    is_high_risk_for_approval_async,
    is_risk_control_owner,
    is_risk_kri_reporting_owner,
)
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, Risk, RiskStatus, User
from app.schemas.risk import RiskCapabilities
from app.services._risk_questionnaires.policy import can_send_questionnaire

from .common import has_pending_action, pending_approvals


async def risk_capabilities(
    db: AsyncSession,
    *,
    current_user: User,
    risk: Risk,
    preloaded_approvals: list[ApprovalRequest] | None = None,
    high_risk_min_net_score: int | None = None,
    can_read_override: bool | None = None,
    is_kri_reporting_owner_for_risk: bool | None = None,
    is_control_owner_for_risk: bool | None = None,
) -> RiskCapabilities:
    approvals = preloaded_approvals
    if approvals is None:
        approvals = await pending_approvals(
            db,
            resource_type=ApprovalResourceType.RISK,
            resource_id=risk.id,
        )
    has_pending_delete = has_pending_action(approvals, ApprovalActionType.DELETE)
    has_pending_update = has_pending_action(approvals, ApprovalActionType.EDIT)
    is_archived = risk.status == RiskStatus.archived.value
    is_owner = risk.owner_id == current_user.id
    can_read = can_read_override if can_read_override is not None else await can_read_risk_id(db, current_user, risk.id)
    has_update_authority = has_permission(current_user, "risks", "write") or is_owner
    can_update_scope = is_owner or can_access_department_id(current_user, risk.department_id)
    can_update = bool(can_read and has_update_authority and can_update_scope and not has_pending_delete)
    can_delete = bool(has_permission(current_user, "risks", "delete") and can_update_scope)
    can_create_kri = bool(
        can_read
        and has_permission(current_user, "risks", "write")
        and can_access_department_id(current_user, risk.department_id)
        and not is_archived
    )
    is_resolver = can_resolve_approvals(current_user)
    requires_privileged_delete = (
        bool(risk.is_priority or risk.net_score >= high_risk_min_net_score)
        if high_risk_min_net_score is not None
        else await is_high_risk_for_approval_async(risk, db)
    )
    requires_privileged_update = bool(risk.is_priority)
    can_manage_risk_control_links = can_access_department_id(current_user, risk.department_id)
    if not can_manage_risk_control_links:
        can_manage_risk_control_links = (
            is_kri_reporting_owner_for_risk
            if is_kri_reporting_owner_for_risk is not None
            else await is_risk_kri_reporting_owner(db, current_user.id, risk.id)
        )
    if not can_manage_risk_control_links:
        can_manage_risk_control_links = (
            is_control_owner_for_risk
            if is_control_owner_for_risk is not None
            else await is_risk_control_owner(db, current_user.id, risk.id)
        )
    can_link_controls = bool(
        can_read
        and can_manage_risk_control_links
        and not is_archived
        and has_permission(current_user, "risks", "write")
        and has_permission(current_user, "controls", "read")
    )
    return RiskCapabilities(
        can_read=can_read,
        can_update=bool(can_update and not is_archived),
        can_update_sensitive_fields=bool(can_update and is_resolver and not is_archived),
        can_request_update_approval=bool(can_update and not is_resolver and not has_pending_update and not is_archived),
        can_archive_immediately=bool(can_delete and is_resolver and not is_archived),
        can_request_archive_approval=bool(
            can_delete and not is_resolver and not has_pending_delete and not is_archived
        ),
        can_restore=bool(can_delete and is_archived),
        can_send_questionnaire=bool(can_read and can_send_questionnaire(current_user) and risk.owner_id is not None),
        can_create_kri=can_create_kri,
        can_create_linked_control=bool(can_link_controls and has_permission(current_user, "controls", "write")),
        can_link_controls=can_link_controls,
        can_unlink_controls=can_link_controls,
        can_view_linked_controls=bool(can_read and has_permission(current_user, "controls", "read")),
        can_view_linked_vendors=bool(can_read and has_permission(current_user, "vendors", "read")),
        can_create_issue=bool(can_read and has_permission(current_user, "issues", "write")),
        has_pending_delete_approval=has_pending_delete,
        has_pending_update_approval=has_pending_update,
        requires_privileged_update_approval=requires_privileged_update,
        requires_privileged_delete_approval=requires_privileged_delete,
    )
