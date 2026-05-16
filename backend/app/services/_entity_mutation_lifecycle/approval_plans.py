from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import (
    build_approval_queued_response,
    check_control_requires_privileged_approval,
    create_approval_request_with_audit,
    get_kri_edit_approval_metadata,
    get_primary_approver_for_control,
    get_risk_edit_approval_metadata,
)
from app.core.exceptions import ValidationError
from app.core.permissions import has_sensitive_field_changes, is_high_risk_for_approval_async
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    ControlRiskLink,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.services._entity_mutation_lifecycle.contracts import EntityMutationOutcome
from app.services._riskhub_config.approval_scenario_roles import APPROVER_ROLES
from app.services.approval_scenario_policy import (
    apply_approval_scenario_snapshot,
    approval_privilege_tier,
    load_approval_scenario_policy,
)


def build_pending_changes(target: object, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        key: {
            "old": getattr(target, key, None),
            "new": value.value if hasattr(value, "value") else value,
        }
        for key, value in update_data.items()
    }


def build_priority_risk_change_set(risk: Risk, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    changed = {}
    for field, new_val in update_data.items():
        old_val = getattr(risk, field, None)
        if hasattr(new_val, "value"):
            new_val = new_val.value
        if old_val != new_val:
            changed[field] = {"old": old_val, "new": new_val}
    return changed


async def first_high_risk_linked_risk(db: AsyncSession, control_id: int) -> tuple[bool, Risk | None]:
    result = await db.execute(select(Risk).join(ControlRiskLink).where(ControlRiskLink.control_id == control_id))
    for risk in result.scalars():
        if await is_high_risk_for_approval_async(risk, db):
            return True, risk
    return False, None


async def create_risk_edit_approval_if_required(
    db: AsyncSession,
    *,
    risk: Risk,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome | None:
    if approval_privilege_tier(current_user).is_privileged:
        return None

    old_data: dict[str, object] = {
        "owner_id": risk.owner_id,
        "department_id": risk.department_id,
        "category": risk.category,
        "is_priority": risk.is_priority,
    }
    has_sensitive, changed = has_sensitive_field_changes("risk", old_data, update_data)
    is_priority_risk_edit = risk.is_priority and bool(update_data)

    if not has_sensitive and not is_priority_risk_edit:
        return None

    scenario_policy = None
    if is_priority_risk_edit:
        scenario_policy = await load_approval_scenario_policy(
            db,
            "risk_edit_priority",
            default_roles=list(APPROVER_ROLES),
        )
        if not scenario_policy.requires_approval:
            return None

    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            ApprovalRequest.resource_id == risk.id,
            ApprovalRequest.action_type == ApprovalActionType.EDIT,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Edit request already pending for this risk")

    if is_priority_risk_edit and not has_sensitive:
        changed = build_priority_risk_change_set(risk, update_data)

    desc_snippet = risk.description[:50] if risk.description else ""
    reason = (
        f"Edit to priority risk - fields: {', '.join(changed.keys())}"
        if is_priority_risk_edit and not has_sensitive
        else f"Change to sensitive fields: {', '.join(changed.keys())}"
    )
    primary_approver_id, requires_privileged = await get_risk_edit_approval_metadata(
        db,
        risk=risk,
        requester_id=current_user.id,
    )

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=f"{risk.risk_id_code}: {desc_snippet}",
        requested_by_id=current_user.id,
        reason=reason,
        action_type=ApprovalActionType.EDIT,
        pending_changes=changed,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    if scenario_policy is not None:
        apply_approval_scenario_snapshot(approval, scenario_policy)

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=risk.department_id,
    )

    response = build_approval_queued_response(
        message="Change requires approval" + (" (priority risk)" if is_priority_risk_edit else ""),
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(changed.keys()),
        pending_changes=changed,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)


async def create_control_edit_approval_if_required(
    db: AsyncSession,
    *,
    control: Control,
    current_user: User,
    update_data: dict[str, Any],
    is_owner: bool,
) -> EntityMutationOutcome | None:
    if approval_privilege_tier(current_user).is_privileged:
        return None

    requires_approval = False
    approval_reason = ""
    pending_changes = {}
    is_priority_linked = False

    is_priority_linked, high_risk = await first_high_risk_linked_risk(db, control.id)
    if is_priority_linked and high_risk:
        requires_approval = True
        approval_reason = f"Edit to control linked to critical risk {high_risk.risk_id_code}"
        pending_changes = build_pending_changes(control, update_data)

    if not requires_approval:
        old_data: dict[str, object] = {
            "control_owner_id": control.control_owner_id,
            "department_id": control.department_id,
        }
        has_sensitive, changed = has_sensitive_field_changes("control", old_data, update_data)
        if has_sensitive:
            requires_approval = True
            approval_reason = f"Change to sensitive fields: {', '.join(changed.keys())}"
            pending_changes = changed

    if not requires_approval and is_owner:
        requires_approval = True
        approval_reason = "Control owner edit requires Risk Owner approval"
        pending_changes = build_pending_changes(control, update_data)
        is_priority_linked = await check_control_requires_privileged_approval(db, control.id)

    if not requires_approval:
        return None

    scenario_policy = await load_approval_scenario_policy(
        db,
        "control_edit",
        default_roles=list(APPROVER_ROLES),
    )
    if not scenario_policy.requires_approval:
        return None

    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control.id,
            ApprovalRequest.action_type == ApprovalActionType.EDIT,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Edit request already pending for this control")

    primary_approver_id = await get_primary_approver_for_control(db, control.id)
    if primary_approver_id == current_user.id:
        primary_approver_id = None

    name_snippet = (control.name or "").strip()[:50]
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=name_snippet or "Unknown control",
        requested_by_id=current_user.id,
        reason=approval_reason,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=is_priority_linked,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=control.department_id,
    )

    response = build_approval_queued_response(
        message="Change requires approval",
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(pending_changes.keys()),
        pending_changes=pending_changes,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=is_priority_linked,
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)


async def create_kri_edit_approval_if_required(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    update_data: dict[str, Any],
    normalized_vendor_ids: list[int] | None,
    current_vendor_ids: list[int],
    current_user: User,
) -> EntityMutationOutcome | None:
    scenario_policy = await load_approval_scenario_policy(
        db,
        "kri_edit",
        default_roles=list(APPROVER_ROLES),
    )
    if approval_privilege_tier(current_user).is_privileged or not scenario_policy.requires_approval:
        return None

    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.EDIT,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Edit request already pending for this KRI")

    pending_changes = {key: {"old": getattr(kri, key, None), "new": value} for key, value in update_data.items()}
    if normalized_vendor_ids is not None and normalized_vendor_ids != current_vendor_ids:
        pending_changes["linked_vendor_ids"] = {
            "old": current_vendor_ids,
            "new": normalized_vendor_ids,
        }
    name_snippet = (kri.metric_name or "").strip()[:50]
    primary_approver_id, requires_privileged = await get_kri_edit_approval_metadata(
        db,
        kri=kri,
        requester_id=current_user.id,
    )
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=name_snippet or "Unknown KRI",
        requested_by_id=current_user.id,
        reason=f"Edit to KRI '{name_snippet}' requires approval",
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
    )

    response = build_approval_queued_response(
        message="Change requires approval",
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(pending_changes.keys()),
        pending_changes=pending_changes,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)
