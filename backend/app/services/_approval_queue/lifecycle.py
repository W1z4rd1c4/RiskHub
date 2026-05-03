from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.approval_helpers import (
    create_approval_request_with_audit,
    get_control_delete_approval_metadata,
    get_primary_approver_for_risk,
    get_risk_delete_approval_metadata,
)
from app.core.permissions import can_resolve_approvals
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    User,
)
from app.schemas.approval_request import (
    ApprovalRequestCreate,
    ApprovalRequestListResponse,
    ApprovalRequestRead,
    ApprovalResourceTypeEnum,
    ApprovalStatusEnum,
)
from app.services.approval_queue_visibility import (
    count_visible_pending_approvals_for_user,
    visible_pending_approvals_for_user,
)
from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy

DELETE_SCENARIO_DEFAULT_ROLES = ["risk_owner", "risk_manager", "cro"]


@dataclass(frozen=True)
class ApprovalRequestIntakePlan:
    resource_type: ApprovalResourceType
    resource_id: int
    resource_name: str
    scenario_key: str
    department_id: int | None
    primary_approver_id: int | None
    requires_privileged_approval: bool


@dataclass(frozen=True)
class ApprovalQueueProjection:
    approval: ApprovalRequest
    item: ApprovalRequestRead | None
    skipped_reason: str | None = None


@dataclass(frozen=True)
class ApprovalQueuePage:
    items: list[ApprovalRequestRead]
    total: int
    skip: int
    limit: int
    skipped_corrupt_payloads: int = 0

    def to_response(self) -> ApprovalRequestListResponse:
        return ApprovalRequestListResponse(items=self.items, total=self.total, skip=self.skip, limit=self.limit)


async def _build_delete_intake_plan(
    *,
    db: AsyncSession,
    request_data: ApprovalRequestCreate,
    current_user: User,
) -> ApprovalRequestIntakePlan:
    from app.api.v1.endpoints.approvals._delete_authorization import (
        assert_can_request_delete_control,
        assert_can_request_delete_kri,
        assert_can_request_delete_risk,
    )

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


async def create_delete_approval_request(
    *,
    db: AsyncSession,
    request_data: ApprovalRequestCreate,
    current_user: User,
) -> ApprovalRequestRead:
    from app.api.v1.endpoints.approvals._shared import _build_approval_read

    plan = await _build_delete_intake_plan(db=db, request_data=request_data, current_user=current_user)
    scenario_policy = await load_approval_scenario_policy(
        db,
        plan.scenario_key,
        default_roles=DELETE_SCENARIO_DEFAULT_ROLES,
    )
    if not scenario_policy.requires_approval:
        raise HTTPException(status_code=400, detail="This delete scenario does not require approval")

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

    approval = ApprovalRequest(
        resource_type=plan.resource_type,
        resource_id=plan.resource_id,
        resource_name=plan.resource_name,
        action_type=ApprovalActionType.DELETE,
        requested_by_id=current_user.id,
        reason=request_data.reason,
        status=ApprovalStatus.PENDING,
        primary_approver_id=plan.primary_approver_id,
        requires_privileged_approval=plan.requires_privileged_approval,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)
    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=plan.department_id,
        on_duplicate_detail="An approval request is already pending for this action.",
    )

    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    return _build_approval_read(result.scalar_one(), current_user)


def _project_approval_queue_item(approval: ApprovalRequest, current_user: User) -> ApprovalQueueProjection:
    from app.api.v1.endpoints.approvals._shared import _build_approval_read, logger

    try:
        return ApprovalQueueProjection(approval=approval, item=_build_approval_read(approval, current_user))
    except Exception as exc:
        logger.error(f"Skipping corrupted approval request {approval.id}: {exc}")
        return ApprovalQueueProjection(approval=approval, item=None, skipped_reason=str(exc))


def _approval_queue_page(
    *,
    approvals: list[ApprovalRequest],
    total: int,
    skip: int,
    limit: int,
    current_user: User,
) -> ApprovalQueuePage:
    projections = [_project_approval_queue_item(approval, current_user) for approval in approvals]
    items = [projection.item for projection in projections if projection.item is not None]
    return ApprovalQueuePage(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        skipped_corrupt_payloads=sum(1 for projection in projections if projection.item is None),
    )


async def list_approval_queue_page(
    *,
    db: AsyncSession,
    current_user: User,
    skip: int,
    limit: int,
    status_filter: ApprovalStatusEnum | None,
    resource_type: ApprovalResourceTypeEnum | None,
    my_requests: bool,
) -> ApprovalRequestListResponse:
    from app.api.v1.endpoints.approvals._shared import logger

    logger.info(
        (
            f"List approvals: user={current_user.id} can_resolve={can_resolve_approvals(current_user)} "
            f"filter={status_filter} my={my_requests}"
        )
    )
    base_query = select(ApprovalRequest)
    is_privileged = can_resolve_approvals(current_user)
    if is_privileged:
        if my_requests:
            base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)
    elif not (status_filter == ApprovalStatusEnum.pending and not my_requests):
        base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)

    if status_filter:
        if status_filter == ApprovalStatusEnum.pending:
            if is_privileged or my_requests:
                base_query = base_query.where(
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
                )
            else:
                pending_approvals = await visible_pending_approvals_for_user(
                    db,
                    current_user=current_user,
                    resource_type=ApprovalResourceType(resource_type.value) if resource_type else None,
                )
                return _approval_queue_page(
                    approvals=pending_approvals[skip : skip + limit],
                    total=len(pending_approvals),
                    skip=skip,
                    limit=limit,
                    current_user=current_user,
                ).to_response()
        else:
            base_query = base_query.where(ApprovalRequest.status == ApprovalStatus(status_filter.value.upper()))
    if resource_type:
        base_query = base_query.where(ApprovalRequest.resource_type == ApprovalResourceType(resource_type.value))

    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar() or 0
    result = await db.execute(
        base_query.options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .offset(skip)
        .limit(limit)
        .order_by(ApprovalRequest.created_at.desc())
    )
    return _approval_queue_page(
        approvals=list(result.scalars().all()),
        total=total,
        skip=skip,
        limit=limit,
        current_user=current_user,
    ).to_response()


async def count_pending_approval_queue(*, db: AsyncSession, current_user: User) -> dict[str, int]:
    if can_resolve_approvals(current_user):
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
        return {"count": result.scalar() or 0}

    return {"count": await count_visible_pending_approvals_for_user(db, current_user=current_user)}


async def list_my_approval_queue_page(
    *,
    db: AsyncSession,
    current_user: User,
    skip: int,
    limit: int,
) -> ApprovalRequestListResponse:
    approvals = await visible_pending_approvals_for_user(
        db,
        current_user=current_user,
        include_requester=False,
    )
    return _approval_queue_page(
        approvals=approvals[skip : skip + limit],
        total=len(approvals),
        skip=skip,
        limit=limit,
        current_user=current_user,
    ).to_response()
