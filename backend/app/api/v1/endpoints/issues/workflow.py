from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.issue import (
    IssueAssignRequest,
    IssueCloseRequest,
    IssueProgressUpdateRequest,
    IssueRead,
    IssueStartRemediationRequest,
)
from app.services._issue_workflow.lifecycle import (
    assign_issue_detail,
    close_issue_detail,
    start_remediation_detail,
    update_remediation_progress_detail,
)

router = APIRouter()


@router.post("/issues/{issue_id}/assign", response_model=IssueRead)
async def assign_issue(
    issue_id: int,
    payload: IssueAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    outcome = await assign_issue_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response


@router.post("/issues/{issue_id}/start-remediation", response_model=IssueRead)
async def start_remediation(
    issue_id: int,
    payload: IssueStartRemediationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    outcome = await start_remediation_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response


@router.post("/issues/{issue_id}/update-progress", response_model=IssueRead)
async def update_remediation_progress(
    issue_id: int,
    payload: IssueProgressUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    outcome = await update_remediation_progress_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response


@router.post("/issues/{issue_id}/close", response_model=IssueRead)
async def close_issue(
    issue_id: int,
    payload: IssueCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    outcome = await close_issue_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response
