from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_resolve_approvals
from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus, User
from app.schemas.approval_request import ApprovalRequestListResponse, ApprovalResourceTypeEnum, ApprovalStatusEnum
from app.services.approval_queue_visibility import visible_pending_approvals_for_user

from .logging import queue_logger
from .projection import approval_queue_page


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
    queue_logger.info(
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
                return approval_queue_page(
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
    return approval_queue_page(
        approvals=list(result.scalars().all()),
        total=total,
        skip=skip,
        limit=limit,
        current_user=current_user,
    ).to_response()


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
    return approval_queue_page(
        approvals=approvals[skip : skip + limit],
        total=len(approvals),
        skip=skip,
        limit=limit,
        current_user=current_user,
    ).to_response()
