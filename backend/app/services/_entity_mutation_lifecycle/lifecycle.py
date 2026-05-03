from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.v1.endpoints._monitoring_response import (
    load_monitoring_response_context,
    serialize_control_read,
    serialize_kri_response,
    serialize_risk_read,
)
from app.core.activity_logger import build_change_set, log_activity
from app.core.approval_helpers import (
    build_approval_queued_response,
    check_control_requires_privileged_approval,
    create_approval_request_with_audit,
    get_control_delete_approval_metadata,
    get_primary_approver_for_control,
    get_primary_approver_for_risk,
    get_risk_delete_approval_metadata,
)
from app.core.datetime_utils import utc_now
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import (
    can_resolve_approvals,
    check_department_access,
    has_sensitive_field_changes,
    is_high_risk_for_approval_async,
    is_control_owner,
)
from app.core.security import check_permission
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    ControlRiskLink,
    KeyRiskIndicator,
    Risk,
    RiskTypeConfig,
    User,
    VendorKRILink,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import ControlStatusEnum
from app.schemas.risk import RiskStatusEnum
from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy
from app.services.authorization_capabilities import control_capabilities, kri_capabilities, risk_capabilities
from app.services.kri_vendor_assignment import (
    assign_vendors_to_kri,
    normalize_vendor_ids,
    validate_assignable_vendors,
)
from app.services._kri_history.value_application import visible_linked_vendors

EntityMutationKind = Literal["applied", "approval_queued", "no_op", "blocked"]


@dataclass(frozen=True)
class EntityMutationOutcome:
    kind: EntityMutationKind
    response: Any


@dataclass(frozen=True)
class EntityMutationOptions:
    actor: User
    reload: bool = True
    serialize: bool = True
    allow_direct_apply: bool = True


@dataclass(frozen=True)
class EntityApprovalPlan:
    resource_type: ApprovalResourceType
    action_type: ApprovalActionType
    scenario_key: str | None
    pending_changes: dict[str, Any] | None
    primary_approver_id: int | None
    requires_privileged_approval: bool = False


@dataclass(frozen=True)
class EntityDirectApplyPlan:
    target_updates: dict[str, Any]
    activity_entity_type: ActivityEntityType
    activity_action: ActivityAction
    department_id: int | None


def _raise_missing_permission(resource: str, action: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Permission denied: {resource}:{action}",
    )


async def _validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:
    result = await db.execute(
        select(RiskTypeConfig).where(
            RiskTypeConfig.code == risk_type_code,
            RiskTypeConfig.is_active.is_(True),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown risk type '{risk_type_code}'. Available types can be viewed in Risk Hub configuration.",
        )


def _build_pending_changes(control: Control, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        key: {
            "old": getattr(control, key, None),
            "new": value.value if hasattr(value, "value") else value,
        }
        for key, value in update_data.items()
    }


async def _first_high_risk_linked_risk(db: AsyncSession, control_id: int) -> tuple[bool, Risk | None]:
    result = await db.execute(select(Risk).join(ControlRiskLink).where(ControlRiskLink.control_id == control_id))
    for risk in result.scalars():
        if await is_high_risk_for_approval_async(risk, db):
            return True, risk
    return False, None


async def _assert_can_request_delete_risk(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> Risk:
    if not check_permission(current_user, "risks", "delete"):
        _raise_missing_permission("risks", "delete")

    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")

    is_owner = risk.owner_id == current_user.id
    if not is_owner:
        check_department_access(risk.department_id, current_user)

    return risk


async def _assert_can_request_delete_control(
    db: AsyncSession,
    *,
    control_id: int,
    current_user: User,
) -> Control:
    if not check_permission(current_user, "controls", "delete"):
        _raise_missing_permission("controls", "delete")

    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")

    check_department_access(control.department_id, current_user)
    return control


async def _assert_can_request_delete_kri(
    db: AsyncSession,
    *,
    kri_id: int,
    current_user: User,
) -> KeyRiskIndicator:
    if not check_permission(current_user, "risks", "delete"):
        _raise_missing_permission("risks", "delete")

    kri = (
        await db.execute(
            select(KeyRiskIndicator)
            .join(Risk)
            .where(KeyRiskIndicator.id == kri_id)
            .options(joinedload(KeyRiskIndicator.risk))
        )
    ).scalar_one_or_none()
    if kri is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KRI not found")

    check_department_access(kri.risk.department_id, current_user)
    return kri


async def _load_risk_or_404(db: AsyncSession, risk_id: int) -> Risk:
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    return risk


def _assert_risk_update_access(risk: Risk, current_user: User) -> tuple[bool, bool]:
    has_write = check_permission(current_user, "risks", "write")
    is_owner = risk.owner_id == current_user.id

    if not is_owner:
        check_department_access(risk.department_id, current_user)

    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: risks:write or risk owner required",
        )

    return has_write, is_owner


async def _validate_risk_update_payload(db: AsyncSession, risk: Risk, update_data: dict[str, Any]) -> None:
    if "risk_type" in update_data:
        await _validate_risk_type(db, update_data["risk_type"])

    if risk.status == RiskStatusEnum.archived.value:
        if "status" in update_data and update_data["status"] != RiskStatusEnum.archived.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reactivate archived risk. Please create a new risk or contact administrator.",
            )


async def _assert_no_pending_delete(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
    detail: str,
) -> None:
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == resource_type,
            ApprovalRequest.resource_id == resource_id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=detail)


async def _assert_no_existing_pending_delete_request(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
) -> None:
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == resource_type,
            ApprovalRequest.resource_id == resource_id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")


def _build_priority_risk_change_set(risk: Risk, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    changed = {}
    for field, new_val in update_data.items():
        old_val = getattr(risk, field, None)
        if hasattr(new_val, "value"):
            new_val = new_val.value
        if old_val != new_val:
            changed[field] = {"old": old_val, "new": new_val}
    return changed


async def _create_risk_edit_approval_if_required(
    db: AsyncSession,
    *,
    risk: Risk,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome | None:
    if can_resolve_approvals(current_user):
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
            default_roles=["risk_owner", "risk_manager", "cro"],
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
        raise HTTPException(status_code=400, detail="Edit request already pending for this risk")

    if is_priority_risk_edit and not has_sensitive:
        changed = _build_priority_risk_change_set(risk, update_data)

    desc_snippet = risk.description[:50] if risk.description else ""
    reason = (
        f"Edit to priority risk - fields: {', '.join(changed.keys())}"
        if is_priority_risk_edit and not has_sensitive
        else f"Change to sensitive fields: {', '.join(changed.keys())}"
    )
    primary_approver_id = None
    if scenario_policy is not None:
        primary_approver_id = await get_primary_approver_for_risk(db, risk.id, requester_id=current_user.id)

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
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)


def _risk_score_change_set(risk: Risk, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    new_gross_probability = update_data.get("gross_probability", risk.gross_probability)
    new_gross_impact = update_data.get("gross_impact", risk.gross_impact)
    new_net_probability = update_data.get("net_probability", risk.net_probability)
    new_net_impact = update_data.get("net_impact", risk.net_impact)
    extra_changes = {}
    if "gross_probability" in update_data or "gross_impact" in update_data:
        extra_changes["gross_score"] = {
            "old": risk.gross_score,
            "new": new_gross_probability * new_gross_impact,
        }
    if "net_probability" in update_data or "net_impact" in update_data:
        extra_changes["net_score"] = {
            "old": risk.net_score,
            "new": new_net_probability * new_net_impact,
        }
    return extra_changes


async def _reload_risk_with_relationships(db: AsyncSession, risk_id: int) -> Risk:
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        )
        .where(Risk.id == risk_id)
    )
    return result.scalar_one()


async def update_risk_detail(
    *,
    db: AsyncSession,
    risk_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    risk = await _load_risk_or_404(db, risk_id)
    _assert_risk_update_access(risk, current_user)
    await _validate_risk_update_payload(db, risk, update_data)
    await _assert_no_pending_delete(
        db,
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        detail="Cannot update risk while deletion is pending approval",
    )
    if "owner_id" in update_data:
        await validate_active_owner_reference(
            db,
            user_id=update_data["owner_id"],
            label="Risk owner",
        )

    approval_outcome = await _create_risk_edit_approval_if_required(
        db,
        risk=risk,
        update_data=update_data,
        current_user=current_user,
    )
    if approval_outcome is not None:
        return approval_outcome

    extra_changes = _risk_score_change_set(risk, update_data)
    changes = build_change_set(risk, update_data, extra_changes=extra_changes)

    for field, value in update_data.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(risk, field, value)

    risk.gross_score = risk.gross_probability * risk.gross_impact
    risk.net_score = risk.net_probability * risk.net_impact

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=f"{risk.risk_id_code}: {risk.description[:50]}",
        safe_entity_label=risk.risk_id_code,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=risk.department_id,
        changes=changes,
    )
    await db.commit()
    await db.refresh(risk)

    reloaded_risk = await _reload_risk_with_relationships(db, risk.id)
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    capabilities = await risk_capabilities(db, current_user=current_user, risk=reloaded_risk)
    response = serialize_risk_read(reloaded_risk, monitoring_context, capabilities=capabilities)
    return EntityMutationOutcome(kind="applied", response=response)


async def _load_control_or_404(db: AsyncSession, control_id: int) -> Control:
    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    return control


async def _assert_control_update_access(
    db: AsyncSession,
    *,
    control: Control,
    control_id: int,
    current_user: User,
) -> tuple[bool, bool]:
    has_write = check_permission(current_user, "controls", "write")
    is_owner = await is_control_owner(db, current_user.id, control_id)

    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: controls:write or control owner required",
        )

    if not is_owner:
        check_department_access(control.department_id, current_user)

    return has_write, is_owner


async def _create_control_edit_approval_if_required(
    db: AsyncSession,
    *,
    control: Control,
    current_user: User,
    update_data: dict[str, Any],
    is_owner: bool,
) -> EntityMutationOutcome | None:
    if can_resolve_approvals(current_user):
        return None

    requires_approval = False
    approval_reason = ""
    pending_changes = {}
    is_priority_linked = False

    is_priority_linked, high_risk = await _first_high_risk_linked_risk(db, control.id)
    if is_priority_linked and high_risk:
        requires_approval = True
        approval_reason = f"Edit to control linked to critical risk {high_risk.risk_id_code}"
        pending_changes = _build_pending_changes(control, update_data)

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
        pending_changes = _build_pending_changes(control, update_data)
        is_priority_linked = await check_control_requires_privileged_approval(db, control.id)

    if not requires_approval:
        return None

    scenario_policy = await load_approval_scenario_policy(
        db,
        "control_edit",
        default_roles=["risk_owner", "risk_manager", "cro"],
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
        raise HTTPException(status_code=400, detail="Edit request already pending for this control")

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


async def _reload_control_with_relationships(db: AsyncSession, control_id: int) -> Control:
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .where(Control.id == control_id)
    )
    return result.scalar_one()


async def update_control_detail(
    *,
    db: AsyncSession,
    control_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    control = await _load_control_or_404(db, control_id)
    _, is_owner = await _assert_control_update_access(
        db,
        control=control,
        control_id=control_id,
        current_user=current_user,
    )
    await _assert_no_pending_delete(
        db,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        detail="Cannot update control while deletion is pending approval",
    )
    if "control_owner_id" in update_data:
        await validate_active_owner_reference(
            db,
            user_id=update_data["control_owner_id"],
            label="Control owner",
        )

    approval_outcome = await _create_control_edit_approval_if_required(
        db,
        control=control,
        current_user=current_user,
        update_data=update_data,
        is_owner=is_owner,
    )
    if approval_outcome is not None:
        return approval_outcome

    changes = build_change_set(control, update_data)

    for field, value in update_data.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(control, field, value)

    control.updated_by_id = current_user.id

    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=control.department_id,
        changes=changes,
    )
    await db.commit()
    await db.refresh(control)

    reloaded_control = await _reload_control_with_relationships(db, control.id)
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    capabilities = await control_capabilities(db, current_user=current_user, control=reloaded_control)
    response = serialize_control_read(reloaded_control, monitoring_context, capabilities=capabilities)
    return EntityMutationOutcome(kind="applied", response=response)


async def update_kri_detail(
    *,
    db: AsyncSession,
    kri_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk), selectinload(KeyRiskIndicator.vendor_links))
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    check_department_access(kri.risk.department_id, current_user)

    if kri.is_archived:
        raise HTTPException(status_code=409, detail="Cannot update archived KRI")

    requested_vendor_ids = update_data.pop("linked_vendor_ids", None)
    normalized_vendor_ids = normalize_vendor_ids(requested_vendor_ids) if requested_vendor_ids is not None else None
    current_vendor_ids = sorted(link.vendor_id for link in getattr(kri, "vendor_links", []) or [])

    if normalized_vendor_ids is not None:
        await validate_assignable_vendors(
            db,
            current_user=current_user,
            vendor_ids=normalized_vendor_ids,
        )

    if "current_value" in update_data:
        raise HTTPException(
            status_code=400,
            detail="Cannot update current_value via PUT. Use POST /kris/{id}/values to record new values.",
        )

    new_lower = update_data.get("lower_limit", kri.lower_limit)
    new_upper = update_data.get("upper_limit", kri.upper_limit)
    if new_lower >= new_upper:
        raise HTTPException(status_code=400, detail="lower_limit must be less than upper_limit")

    await _assert_no_pending_delete(
        db,
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        detail="Cannot update KRI while deletion is pending approval",
    )
    if "reporting_owner_id" in update_data:
        await validate_active_owner_reference(
            db,
            user_id=update_data["reporting_owner_id"],
            label="Reporting owner",
        )

    scenario_policy = await load_approval_scenario_policy(
        db,
        "kri_edit",
        default_roles=["risk_owner", "risk_manager", "cro"],
    )
    if not can_resolve_approvals(current_user) and scenario_policy.requires_approval:
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

        pending_changes = {k: {"old": getattr(kri, k, None), "new": v} for k, v in update_data.items()}
        if normalized_vendor_ids is not None and normalized_vendor_ids != current_vendor_ids:
            pending_changes["linked_vendor_ids"] = {
                "old": current_vendor_ids,
                "new": normalized_vendor_ids,
            }
        name_snippet = (kri.metric_name or "").strip()[:50]
        primary_approver_id = await get_primary_approver_for_risk(db, kri.risk_id, requester_id=current_user.id)
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
        )
        return EntityMutationOutcome(kind="approval_queued", response=response)

    extra_changes = {}
    if normalized_vendor_ids is not None and normalized_vendor_ids != current_vendor_ids:
        extra_changes["linked_vendor_ids"] = {"old": current_vendor_ids, "new": normalized_vendor_ids}
    changes = build_change_set(kri, update_data, extra_changes=extra_changes)

    try:
        for field, value in update_data.items():
            setattr(kri, field, value)

        if normalized_vendor_ids is not None:
            await assign_vendors_to_kri(
                db,
                kri=kri,
                linked_vendor_ids=normalized_vendor_ids,
            )

        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            safe_entity_label=kri.metric_name,
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=kri.risk.department_id,
            changes=changes,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(kri)

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri.id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    reloaded_kri = result.scalar_one()

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    capabilities = await kri_capabilities(db, current_user=current_user, kri=reloaded_kri)
    response = serialize_kri_response(
        reloaded_kri,
        monitoring_context,
        linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", [])),
        capabilities=capabilities,
    )
    return EntityMutationOutcome(kind="applied", response=response)


async def archive_risk_detail(
    *,
    db: AsyncSession,
    risk_id: int,
    reason: str,
    current_user: User,
) -> EntityMutationOutcome:
    risk = await _assert_can_request_delete_risk(
        db,
        risk_id=risk_id,
        current_user=current_user,
    )

    scenario_policy = await load_approval_scenario_policy(
        db,
        "risk_delete",
        default_roles=["risk_owner", "risk_manager", "cro"],
    )

    if can_resolve_approvals(current_user) or not scenario_policy.requires_approval:
        risk.status = RiskStatusEnum.archived.value

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
        return EntityMutationOutcome(kind="applied", response=Response(status_code=status.HTTP_204_NO_CONTENT))

    await _assert_no_existing_pending_delete_request(
        db,
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
    )

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
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        requested_by_id=current_user.id,
        reason=f"{reason}\n\nDescription: {desc_snippet}" if desc_snippet else reason,
        status=ApprovalStatus.PENDING,
        action_type=ApprovalActionType.DELETE,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=risk.department_id,
    )

    response = build_approval_queued_response(
        message="Deletion request submitted for approval",
        approval_id=approval.id,
        action_type="delete",
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)


async def archive_control_detail(
    *,
    db: AsyncSession,
    control_id: int,
    reason: str,
    current_user: User,
) -> EntityMutationOutcome:
    control = await _assert_can_request_delete_control(
        db,
        control_id=control_id,
        current_user=current_user,
    )

    scenario_policy = await load_approval_scenario_policy(
        db,
        "control_delete",
        default_roles=["risk_owner", "risk_manager", "cro"],
    )

    if can_resolve_approvals(current_user) or not scenario_policy.requires_approval:
        control.status = ControlStatusEnum.archived.value
        control.updated_by_id = current_user.id

        await log_activity(
            db,
            entity_type=ActivityEntityType.CONTROL,
            entity_id=control.id,
            entity_name=f"{control.name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=control.department_id,
        )
        await db.commit()
        return EntityMutationOutcome(kind="applied", response=Response(status_code=status.HTTP_204_NO_CONTENT))

    await _assert_no_existing_pending_delete_request(
        db,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
    )

    name_snippet = (control.name or "").strip()[:50]
    primary_approver_id, requires_privileged = await get_control_delete_approval_metadata(
        db,
        control=control,
        requester_id=current_user.id,
    )
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=name_snippet or "Unknown control",
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        action_type=ApprovalActionType.DELETE,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=control.department_id,
    )

    response = build_approval_queued_response(
        message="Deletion request submitted for approval",
        approval_id=approval.id,
        action_type="delete",
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)


async def archive_kri_detail(
    *,
    db: AsyncSession,
    kri_id: int,
    reason: str,
    current_user: User,
) -> EntityMutationOutcome:
    kri = await _assert_can_request_delete_kri(
        db,
        kri_id=kri_id,
        current_user=current_user,
    )

    scenario_policy = await load_approval_scenario_policy(
        db,
        "kri_delete",
        default_roles=["risk_owner", "risk_manager", "cro"],
    )

    if can_resolve_approvals(current_user) or not scenario_policy.requires_approval:
        kri.is_archived = True
        kri.archived_at = utc_now()
        kri.archived_by_id = current_user.id

        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            safe_entity_label=kri.metric_name,
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=kri.risk.department_id,
        )
        await db.commit()
        return EntityMutationOutcome(kind="applied", response=Response(status_code=204))

    await _assert_no_existing_pending_delete_request(
        db,
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
    )

    name_snippet = (kri.metric_name or "").strip()[:50]
    primary_approver_id = await get_primary_approver_for_risk(db, kri.risk_id, requester_id=current_user.id)
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=name_snippet or "Unknown KRI",
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=kri.risk.department_id,
        on_duplicate_detail="Deletion request already pending",
    )

    response = build_approval_queued_response(
        message="Deletion request submitted for approval",
        approval_id=approval.id,
        action_type="delete",
        primary_approver_id=primary_approver_id,
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)
