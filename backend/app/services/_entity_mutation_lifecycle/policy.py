from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus


def raise_missing_permission(resource: str, action: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Permission denied: {resource}:{action}",
    )


async def assert_no_pending_delete(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
    detail: str,
) -> None:
    pending = (
        await db.execute(
            select(ApprovalRequest)
            .where(ApprovalRequest.resource_type == resource_type)
            .where(ApprovalRequest.resource_id == resource_id)
            .where(ApprovalRequest.action_type == ApprovalActionType.DELETE)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
    ).scalar_one_or_none()
    if pending is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


async def assert_no_existing_pending_delete_request(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
    detail: str,
) -> None:
    await assert_no_pending_delete(
        db,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
    )
