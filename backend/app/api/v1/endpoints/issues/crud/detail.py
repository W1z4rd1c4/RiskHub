from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.issue import IssueRead

from .._shared import _get_readable_issue_or_404, _serialize_issue_read

router = APIRouter()


@router.get("/issues/{issue_id}", response_model=IssueRead)
async def get_issue(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
) -> IssueRead:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    return _serialize_issue_read(issue)
