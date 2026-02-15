from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import IssueException, User
from app.models.issue import IssueExceptionStatus
from app.schemas.issue import (
    IssueExceptionApproveRequest,
    IssueExceptionRead,
    IssueExceptionRequestCreate,
    IssueExceptionRevokeRequest,
)
from app.services.issue_workflow_service import IssueWorkflowService

from ._shared import (
    _active_exception,
    _get_readable_issue_or_404,
    _get_writable_issue_or_404,
    _notify_exception_approved,
    _notify_exception_requested,
    _serialize_exception_with_user_names,
)

router = APIRouter()


@router.post(
    "/issues/{issue_id}/request-exception", response_model=IssueExceptionRead, status_code=status.HTTP_201_CREATED
)
async def request_exception(
    issue_id: int,
    payload: IssueExceptionRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueExceptionRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    exception = await IssueWorkflowService.request_exception(
        db,
        issue=issue,
        reason=payload.reason,
        actor=current_user,
    )
    await _notify_exception_requested(db, issue=issue, actor=current_user)
    await db.commit()
    await db.refresh(exception)
    return await _serialize_exception_with_user_names(db, exception)


@router.post("/issues/{issue_id}/approve-exception", response_model=IssueExceptionRead)
async def approve_exception(
    issue_id: int,
    payload: IssueExceptionApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "approve")),
) -> IssueExceptionRead:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    active = _active_exception(issue)
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Issue already has an active approved exception"
        )

    target_exception: IssueException | None = None
    if payload.exception_id is not None:
        target_exception = (
            await db.execute(
                select(IssueException).where(
                    IssueException.id == payload.exception_id, IssueException.issue_id == issue.id
                )
            )
        ).scalar_one_or_none()
    else:
        target_exception = (
            (
                await db.execute(
                    select(IssueException)
                    .where(
                        IssueException.issue_id == issue.id,
                        IssueException.status == IssueExceptionStatus.requested.value,
                    )
                    .order_by(IssueException.created_at.desc())
                )
            )
            .scalars()
            .first()
        )

    if target_exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested exception not found")

    approved = await IssueWorkflowService.approve_exception(
        db,
        issue=issue,
        exception=target_exception,
        expires_at=payload.expires_at,
        actor=current_user,
    )
    await _notify_exception_approved(
        db,
        issue=issue,
        requested_by_id=approved.requested_by_id,
        owner_user_id=issue.owner_user_id,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(approved)
    return await _serialize_exception_with_user_names(db, approved)


@router.post("/issues/{issue_id}/revoke-exception", response_model=IssueExceptionRead)
async def revoke_exception(
    issue_id: int,
    payload: IssueExceptionRevokeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "approve")),
) -> IssueExceptionRead:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)

    target_exception: IssueException | None = None
    if payload.exception_id is not None:
        target_exception = (
            await db.execute(
                select(IssueException).where(
                    IssueException.id == payload.exception_id, IssueException.issue_id == issue.id
                )
            )
        ).scalar_one_or_none()
    else:
        now = datetime.now(UTC)
        target_exception = (
            (
                await db.execute(
                    select(IssueException)
                    .where(
                        IssueException.issue_id == issue.id,
                        IssueException.status == IssueExceptionStatus.approved.value,
                        IssueException.expires_at.is_not(None),
                        IssueException.expires_at > now,
                    )
                    .order_by(IssueException.approved_at.desc(), IssueException.created_at.desc())
                )
            )
            .scalars()
            .first()
        )

    if target_exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approved exception not found")

    revoked = await IssueWorkflowService.revoke_exception(
        db,
        issue=issue,
        exception=target_exception,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(revoked)
    return await _serialize_exception_with_user_names(db, revoked)
