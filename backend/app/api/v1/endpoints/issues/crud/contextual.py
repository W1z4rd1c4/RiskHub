from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.issue import IssueContextualCreate, IssueRead
from app.services._issue_workflow.execution import create_contextual_issue_detail

router = APIRouter()


@router.post("/issues/contextual", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
async def create_contextual_issue(
    payload: IssueContextualCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    return await create_contextual_issue_detail(db=db, payload=payload, current_user=current_user)
