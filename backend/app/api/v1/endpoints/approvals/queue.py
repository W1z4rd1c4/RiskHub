from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.approval_helpers import (
    create_approval_request_with_audit,
    get_control_delete_approval_metadata,
    get_risk_delete_approval_metadata,
)
from app.core.permissions import can_resolve_approvals
from app.db.session import get_db
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
from app.services.approval_queue_visibility import visible_pending_approvals_for_user

from ._delete_authorization import (
    assert_can_request_delete_control,
    assert_can_request_delete_kri,
    assert_can_request_delete_risk,
)
from ._shared import _build_approval_read, logger

router = APIRouter()


@router.post("", response_model=ApprovalRequestRead, status_code=status.HTTP_201_CREATED)
async def create_approval_request(
    request_data: ApprovalRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Create a new approval request for resource deletion.
    Mirrors the underlying delete route's authorization and delete-workflow metadata.
    """
    # Validate resource exists and get name for snapshot
    resource_name = ""
    department_id: int | None = None
    primary_approver_id: int | None = None
    requires_privileged_approval = False
    if request_data.resource_type == ApprovalResourceTypeEnum.risk:
        risk = await assert_can_request_delete_risk(
            db,
            risk_id=request_data.resource_id,
            current_user=current_user,
        )
        resource_name = f"{risk.risk_id_code}: {risk.description[:50] if risk.description else ''}"
        department_id = risk.department_id
        primary_approver_id, requires_privileged_approval = await get_risk_delete_approval_metadata(
            db,
            risk=risk,
            requester_id=current_user.id,
        )
    elif request_data.resource_type == ApprovalResourceTypeEnum.control:
        control = await assert_can_request_delete_control(
            db,
            control_id=request_data.resource_id,
            current_user=current_user,
        )
        control_label = (control.name or "").strip()[:50]
        resource_name = control_label or "Unknown control"
        department_id = control.department_id
        primary_approver_id, requires_privileged_approval = await get_control_delete_approval_metadata(
            db,
            control=control,
            requester_id=current_user.id,
        )
    elif request_data.resource_type == ApprovalResourceTypeEnum.kri:
        kri = await assert_can_request_delete_kri(
            db,
            kri_id=request_data.resource_id,
            current_user=current_user,
        )
        kri_label = (kri.metric_name or "").strip()[:50]
        resource_name = kri_label or "Unknown KRI"
        department_id = kri.risk.department_id

    # Check for existing pending request (both PENDING and PENDING_PRIVILEGED)
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType(request_data.resource_type.value),
            ApprovalRequest.resource_id == request_data.resource_id,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending for this resource")

    # Create approval request
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType(request_data.resource_type.value),
        resource_id=request_data.resource_id,
        resource_name=resource_name,
        action_type=ApprovalActionType.DELETE,
        requested_by_id=current_user.id,
        reason=request_data.reason,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged_approval,
    )

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=department_id,
        on_duplicate_detail="An approval request is already pending for this action.",
    )

    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()

    return _build_approval_read(approval, current_user)


@router.get("", response_model=ApprovalRequestListResponse)
async def list_approval_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: Optional[ApprovalStatusEnum] = Query(None, alias="status"),
    resource_type: Optional[ApprovalResourceTypeEnum] = None,
    my_requests: bool = Query(False, description="Show only my submitted requests"),
):
    """
    List approval requests.
    - Users with approval-resolution authority see all requests
    - Other users: see only their own requests
    """
    logger.info(
        (
            f"List approvals: user={current_user.id} can_resolve={can_resolve_approvals(current_user)} "
            f"filter={status_filter} my={my_requests}"
        )
    )
    base_query = select(ApprovalRequest)

    is_privileged = can_resolve_approvals(current_user)

    # Permission-based filtering
    if is_privileged:
        # Privileged users can see all, but can filter to just their own
        if my_requests:
            base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)
    else:
        # Non-privileged users default to their own requests, except pending queue where
        # primary-approver items are also included.
        if not (status_filter == ApprovalStatusEnum.pending and not my_requests):
            base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)

    # Apply filters
    if status_filter:
        if status_filter == ApprovalStatusEnum.pending:
            if is_privileged:
                base_query = base_query.where(
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
                )
            elif my_requests:
                base_query = base_query.where(
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
                )
            else:
                resource_type_filter = ApprovalResourceType(resource_type.value) if resource_type else None
                pending_approvals = await visible_pending_approvals_for_user(
                    db,
                    current_user=current_user,
                    resource_type=resource_type_filter,
                )
                total = len(pending_approvals)
                page = pending_approvals[skip : skip + limit]
                pending_items: list[ApprovalRequestRead] = []
                for approval in page:
                    try:
                        pending_items.append(_build_approval_read(approval, current_user))
                    except Exception as e:
                        logger.error(f"Skipping corrupted approval request {approval.id}: {e}")
                        continue
                return ApprovalRequestListResponse(items=pending_items, total=total, skip=skip, limit=limit)
        else:
            base_query = base_query.where(ApprovalRequest.status == ApprovalStatus(status_filter.value.upper()))
    if resource_type:
        base_query = base_query.where(ApprovalRequest.resource_type == ApprovalResourceType(resource_type.value))

    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Fetch with pagination
    query = (
        base_query.options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .offset(skip)
        .limit(limit)
        .order_by(ApprovalRequest.created_at.desc())
    )

    result = await db.execute(query)
    approval_rows = result.scalars().all()

    valid_items: list[ApprovalRequestRead] = []
    for approval in approval_rows:
        try:
            valid_items.append(_build_approval_read(approval, current_user))
        except Exception as e:
            logger.error(f"Skipping corrupted approval request {approval.id}: {e}")
            continue

    return ApprovalRequestListResponse(items=valid_items, total=total, skip=skip, limit=limit)
