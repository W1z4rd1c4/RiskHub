from __future__ import annotations

from fastapi import HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.activity_logger import log_activity
from app.core.approval_helpers import (
    build_approval_queued_response,
    create_approval_request_with_audit,
    get_control_delete_approval_metadata,
    get_risk_delete_approval_metadata,
    get_primary_approver_for_risk,
)
from app.core.datetime_utils import utc_now
from app.core.permissions import can_resolve_approvals, check_department_access
from app.core.security import check_permission
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import ControlStatusEnum
from app.schemas.risk import RiskStatusEnum
from app.services._entity_mutation_lifecycle.contracts import EntityMutationOutcome
from app.services._entity_mutation_lifecycle.policy import raise_missing_permission, assert_no_existing_pending_delete_request
from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy


async def assert_can_request_delete_risk(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> Risk:
    if not check_permission(current_user, "risks", "delete"):
        raise_missing_permission("risks", "delete")

    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")

    if risk.owner_id != current_user.id:
        check_department_access(risk.department_id, current_user)

    return risk


async def assert_can_request_delete_control(
    db: AsyncSession,
    *,
    control_id: int,
    current_user: User,
) -> Control:
    if not check_permission(current_user, "controls", "delete"):
        raise_missing_permission("controls", "delete")

    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")

    check_department_access(control.department_id, current_user)
    return control


async def assert_can_request_delete_kri(
    db: AsyncSession,
    *,
    kri_id: int,
    current_user: User,
) -> KeyRiskIndicator:
    if not check_permission(current_user, "risks", "delete"):
        raise_missing_permission("risks", "delete")

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


async def archive_risk_detail(
    *,
    db: AsyncSession,
    risk_id: int,
    reason: str,
    current_user: User,
) -> EntityMutationOutcome:
    risk = await assert_can_request_delete_risk(db, risk_id=risk_id, current_user=current_user)

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

    await assert_no_existing_pending_delete_request(
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
    control = await assert_can_request_delete_control(db, control_id=control_id, current_user=current_user)

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

    await assert_no_existing_pending_delete_request(
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
    kri = await assert_can_request_delete_kri(db, kri_id=kri_id, current_user=current_user)

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

    await assert_no_existing_pending_delete_request(
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
