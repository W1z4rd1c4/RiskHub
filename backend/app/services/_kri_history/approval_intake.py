from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import (
    build_approval_queued_response,
    create_approval_request_with_audit,
    get_primary_approver_for_risk,
)
from app.core.datetime_utils import utc_now
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    KeyRiskIndicator,
    User,
)
from app.models.kri_history import KRIValueHistory
from app.schemas.kri import KRIHistoryEdit, KRIRecordValue
from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy

from .recording import DuplicateKRIPeriodError
from .workflow import latest_closed_period_end


async def create_kri_submission_approval(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    data: KRIRecordValue,
    current_user: User,
):
    from .value_application import _apply_kri_value_directly

    latest_closed_end = latest_closed_period_end(kri)

    if data.period_end and data.period_end != latest_closed_end:
        raise HTTPException(status_code=400, detail="Non-privileged users cannot specify custom period_end")

    existing_history = await db.scalar(
        select(KRIValueHistory.id)
        .where(
            KRIValueHistory.kri_id == kri.id,
            KRIValueHistory.period_end == latest_closed_end,
        )
        .limit(1)
    )
    if existing_history is not None:
        raise DuplicateKRIPeriodError(f"KRI value already recorded for period ending {latest_closed_end}")

    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.EDIT,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A value submission request is already pending for this KRI")

    scenario_policy = await load_approval_scenario_policy(
        db,
        "kri_value_submit",
        default_roles=["risk_owner", "risk_manager", "cro"],
    )
    if not scenario_policy.requires_approval:
        return await _apply_kri_value_directly(
            db,
            kri=kri,
            data=data,
            current_user=current_user,
            is_privileged_submission=False,
        )

    primary_approver_id = await get_primary_approver_for_risk(db, kri.risk_id, requester_id=current_user.id)
    requires_privileged = bool(kri.risk and kri.risk.is_priority)
    recorded_at = utc_now().isoformat()
    pending_changes = {
        "current_value": {"old": kri.current_value, "new": data.value},
        "period_end": latest_closed_end.isoformat(),
        "recorded_at": recorded_at,
    }

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=f"{kri.metric_name[:30]} (value submission)",
        requested_by_id=current_user.id,
        reason=f"KRI value submission: {data.value}",
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)
    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=kri.risk.department_id,
        on_duplicate_detail="A value submission request is already pending for this KRI.",
    )

    return build_approval_queued_response(
        message="Value submission requires approval"
        + (" (priority risk - privileged approval also required)" if requires_privileged else ""),
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(pending_changes.keys()),
        pending_changes=pending_changes,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )


async def create_kri_history_correction_approval(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    entry: KRIValueHistory,
    entry_id: int,
    data: KRIHistoryEdit,
    current_user: User,
):
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.EDIT,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Edit request already pending for this KRI")

    primary_approver_id = await get_primary_approver_for_risk(db, kri.risk_id, requester_id=current_user.id)
    scenario_policy = await load_approval_scenario_policy(
        db,
        "kri_history_correction",
        default_roles=["cro"],
    )
    pending_changes = {
        "history_entry_id": entry_id,
        "old_value": entry.value,
        "new_value": data.value,
        "reason": data.reason,
        "period_end": entry.period_end.isoformat(),
    }

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=f"{kri.metric_name[:30]} (history correction)",
        requested_by_id=current_user.id,
        reason=data.reason,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=True,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=kri.risk.department_id,
        on_duplicate_detail="A correction request is already pending for this KRI.",
    )

    return build_approval_queued_response(
        message="History correction requires approval (CRO approval required per §5.3)",
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(pending_changes.keys()),
        pending_changes=pending_changes,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=True,
    )
