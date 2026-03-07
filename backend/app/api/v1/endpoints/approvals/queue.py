from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.approval_helpers import create_approval_request_with_audit
from app.core.permissions import can_resolve_approvals, check_department_access
from app.db.session import get_db
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.schemas.approval_request import (
    ApprovalRequestCreate,
    ApprovalRequestListResponse,
    ApprovalRequestRead,
    ApprovalResourceTypeEnum,
    ApprovalStatusEnum,
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
    Requires mandatory reason.
    """
    # Validate resource exists and get name for snapshot
    resource_name = ""
    department_id: int | None = None
    if request_data.resource_type == ApprovalResourceTypeEnum.risk:
        result = await db.execute(select(Risk).where(Risk.id == request_data.resource_id))
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Risk not found")
        # Verify requester has access to resource's department
        check_department_access(resource.department_id, current_user)
        resource_name = f"{resource.risk_id_code}: {resource.description[:50] if resource.description else ''}"
        department_id = resource.department_id
    elif request_data.resource_type == ApprovalResourceTypeEnum.control:
        result = await db.execute(select(Control).where(Control.id == request_data.resource_id))
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Control not found")
        # Verify requester has access to resource's department
        check_department_access(resource.department_id, current_user)
        resource_name = f"Control #{resource.id}: {resource.name[:50] if resource.name else ''}"
        department_id = resource.department_id
    elif request_data.resource_type == ApprovalResourceTypeEnum.kri:
        # Load KRI with linked Risk for department access check
        result = await db.execute(
            select(KeyRiskIndicator)
            .options(selectinload(KeyRiskIndicator.risk))
            .where(KeyRiskIndicator.id == request_data.resource_id)
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="KRI not found")
        # Verify access via linked risk's department
        if not resource.risk:
            raise HTTPException(status_code=404, detail="KRI has no linked risk")
        check_department_access(resource.risk.department_id, current_user)
        resource_name = (resource.metric_name or f"KRI-{resource.id}")[:50]
        department_id = resource.risk.department_id

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
        requested_by_id=current_user.id,
        reason=request_data.reason,
        status=ApprovalStatus.PENDING,
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

    return _build_approval_read(approval)


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
    - Privileged users (Risk Manager, CRO, Admin): see all requests
    - Other users: see only their own requests
    """
    logger.info(
        (
            f"List approvals: user={current_user.id} can_resolve={can_resolve_approvals(current_user)} "
            f"filter={status_filter} my={my_requests}"
        )
    )
    base_query = select(ApprovalRequest)

    # Permission-based filtering
    if can_resolve_approvals(current_user):
        # Privileged users can see all, but can filter to just their own
        if my_requests:
            base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)
    else:
        # Non-privileged users only see their own
        base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)

    # Apply filters
    if status_filter:
        if status_filter == ApprovalStatusEnum.pending:
            # Treat "pending" as the entire approval queue (incl. tier-2 privileged pending)
            base_query = base_query.where(
                ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
            )
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
    approvals = result.scalars().all()

    valid_items = []
    for a in approvals:
        try:
            valid_items.append(_build_approval_read(a))
        except Exception as e:
            logger.error(f"Skipping corrupted approval request {a.id}: {e}")
            continue

    return ApprovalRequestListResponse(items=valid_items, total=total, skip=skip, limit=limit)
