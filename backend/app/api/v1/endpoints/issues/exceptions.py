from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.issue import (
    IssueExceptionApproveRequest,
    IssueExceptionRead,
    IssueExceptionRequestCreate,
    IssueExceptionRevokeRequest,
)
from app.services._issue_workflow.lifecycle import (
    approve_exception_detail,
    request_exception_detail,
    revoke_exception_detail,
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
    outcome = await request_exception_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response


@router.post("/issues/{issue_id}/approve-exception", response_model=IssueExceptionRead)
async def approve_exception(
    issue_id: int,
    payload: IssueExceptionApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "approve")),
) -> IssueExceptionRead:
    outcome = await approve_exception_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response


@router.post("/issues/{issue_id}/revoke-exception", response_model=IssueExceptionRead)
async def revoke_exception(
    issue_id: int,
    payload: IssueExceptionRevokeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "approve")),
) -> IssueExceptionRead:
    outcome = await revoke_exception_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response
