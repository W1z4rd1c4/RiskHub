from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.issue import IssueRead, IssueUpdate
from app.services._issue_workflow.lifecycle import update_issue_detail

router = APIRouter()


@router.patch("/issues/{issue_id}", response_model=IssueRead)
async def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    outcome = await update_issue_detail(
        db=db,
        issue_id=issue_id,
        payload=payload,
        current_user=current_user,
    )
    return outcome.response
