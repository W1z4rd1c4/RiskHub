from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.approval_request import (
    ApprovalRequestCreate,
    ApprovalRequestListResponse,
    ApprovalRequestRead,
    ApprovalResourceTypeEnum,
    ApprovalStatusEnum,
)
from app.services._approval_execution.privilege_context import PrivilegeContext, get_privilege_context
from app.services._approval_queue import (
    create_delete_approval_request,
    list_approval_queue_page,
)

router = APIRouter()


@router.post("", response_model=ApprovalRequestRead, status_code=status.HTTP_201_CREATED)
async def create_approval_request(
    request_data: ApprovalRequestCreate,
    db: AsyncSession = Depends(get_db),
    ctx: PrivilegeContext = Depends(get_privilege_context),
):
    """
    Create a new approval request for resource deletion.
    Mirrors the underlying delete route's authorization and delete-workflow metadata.
    """
    return await create_delete_approval_request(db=db, request_data=request_data, current_user=ctx.user)


@router.get("", response_model=ApprovalRequestListResponse)
async def list_approval_requests(
    db: AsyncSession = Depends(get_db),
    ctx: PrivilegeContext = Depends(get_privilege_context),
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
    return await list_approval_queue_page(
        db=db,
        current_user=ctx.user,
        skip=skip,
        limit=limit,
        status_filter=status_filter,
        resource_type=resource_type,
        my_requests=my_requests,
    )
