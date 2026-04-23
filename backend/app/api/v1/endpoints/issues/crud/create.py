from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.datetime_utils import coerce_utc
from app.core.permissions import can_access_department_id
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Issue, IssueRemediationPlan, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueStatus
from app.schemas.issue import IssueCreate, IssueRead

from .._shared import (
    _ensure_owner_assignable,
    _get_issue_with_relations,
    _serialize_issue_read,
    _validate_user_exists,
)

router = APIRouter()


@router.post("/issues", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
async def create_issue(
    payload: IssueCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    if payload.department_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id is required")
    if not can_access_department_id(current_user, payload.department_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")

    await _validate_user_exists(db, payload.owner_user_id)
    await _ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=payload.department_id,
    )

    now = datetime.now(UTC)
    issue = Issue(
        title=payload.title,
        description=payload.description,
        severity=payload.severity.value,
        status=IssueStatus.open.value,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        department_id=payload.department_id,
        owner_user_id=payload.owner_user_id,
        created_by_id=current_user.id,
        opened_at=now,
        due_at=coerce_utc(payload.due_at),
    )
    db.add(issue)
    await db.flush()

    remediation = IssueRemediationPlan(
        issue_id=issue.id,
        status="draft",
        progress_percent=0,
        owner_user_id=payload.owner_user_id,
        target_date=coerce_utc(payload.due_at),
    )
    db.add(remediation)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=issue.department_id,
        description=f"Created issue: {issue.title}",
    )

    await db.commit()
    issue = await _get_issue_with_relations(db, issue.id)
    return _serialize_issue_read(issue, current_user=current_user)
