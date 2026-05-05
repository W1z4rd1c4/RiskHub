from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import (
    get_control_delete_approval_metadata,
    get_primary_approver_for_risk,
    get_risk_delete_approval_metadata,
)
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus, User
from app.schemas.approval_request import ApprovalRequestCreate, ApprovalResourceTypeEnum
from app.services._entity_mutation_lifecycle.archive_plans import (
    assert_can_request_delete_control,
    assert_can_request_delete_kri,
    assert_can_request_delete_risk,
)

from .contracts import ApprovalRequestIntakePlan


async def assert_delete_request_allowed(
    db: AsyncSession,
    *,
    resource_type: str,
    resource_id: int,
    current_user: User,
):
    if resource_type == "risk":
        return await assert_can_request_delete_risk(db, risk_id=resource_id, current_user=current_user)
    if resource_type == "control":
        return await assert_can_request_delete_control(db, control_id=resource_id, current_user=current_user)
    return await assert_can_request_delete_kri(db, kri_id=resource_id, current_user=current_user)


async def build_delete_intake_plan(
    *,
    db: AsyncSession,
    request_data: ApprovalRequestCreate,
    current_user: User,
) -> ApprovalRequestIntakePlan:
    if request_data.resource_type == ApprovalResourceTypeEnum.risk:
        risk = await assert_can_request_delete_risk(db, risk_id=request_data.resource_id, current_user=current_user)
        primary_approver_id, requires_privileged = await get_risk_delete_approval_metadata(
            db,
            risk=risk,
            requester_id=current_user.id,
        )
        return ApprovalRequestIntakePlan(
            resource_type=ApprovalResourceType.RISK,
            resource_id=request_data.resource_id,
            resource_name=f"{risk.risk_id_code}: {risk.description[:50] if risk.description else ''}",
            scenario_key="risk_delete",
            department_id=risk.department_id,
            primary_approver_id=primary_approver_id,
            requires_privileged_approval=requires_privileged,
        )

    if request_data.resource_type == ApprovalResourceTypeEnum.control:
        control = await assert_can_request_delete_control(
            db,
            control_id=request_data.resource_id,
            current_user=current_user,
        )
        primary_approver_id, requires_privileged = await get_control_delete_approval_metadata(
            db,
            control=control,
            requester_id=current_user.id,
        )
        control_label = (control.name or "").strip()[:50]
        return ApprovalRequestIntakePlan(
            resource_type=ApprovalResourceType.CONTROL,
            resource_id=request_data.resource_id,
            resource_name=control_label or "Unknown control",
            scenario_key="control_delete",
            department_id=control.department_id,
            primary_approver_id=primary_approver_id,
            requires_privileged_approval=requires_privileged,
        )

    kri = await assert_can_request_delete_kri(db, kri_id=request_data.resource_id, current_user=current_user)
    kri_label = (kri.metric_name or "").strip()[:50]
    return ApprovalRequestIntakePlan(
        resource_type=ApprovalResourceType.KRI,
        resource_id=request_data.resource_id,
        resource_name=kri_label or "Unknown KRI",
        scenario_key="kri_delete",
        department_id=kri.risk.department_id,
        primary_approver_id=await get_primary_approver_for_risk(db, kri.risk_id, requester_id=current_user.id),
        requires_privileged_approval=False,
    )


async def ensure_delete_approval_not_pending(db: AsyncSession, *, plan: ApprovalRequestIntakePlan) -> None:
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == plan.resource_type,
            ApprovalRequest.resource_id == plan.resource_id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending for this resource")
