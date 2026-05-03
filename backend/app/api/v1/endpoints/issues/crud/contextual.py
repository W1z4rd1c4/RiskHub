from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Issue, IssueRemediationPlan, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueRemediationStatus, IssueStatus
from app.schemas.issue import IssueContextualCreate, IssueRead
from app.services.authorization_capabilities import issue_capabilities

from .._shared import (
    _ensure_owner_assignable,
    _get_issue_with_relations,
    _serialize_issue_read,
    _validate_user_exists,
    ensure_issue_source_link,
    resolve_contextual_issue_source,
)

router = APIRouter()


@router.post("/issues/contextual", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
async def create_contextual_issue(
    payload: IssueContextualCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    resolved_source = await resolve_contextual_issue_source(
        db,
        current_user,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
    )

    await _validate_user_exists(db, payload.owner_user_id)
    await _ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=resolved_source.department_id,
    )

    due_at = coerce_utc(payload.due_at)
    now = utc_now()
    issue = Issue(
        title=payload.title,
        description=payload.description,
        severity=payload.severity.value,
        status=IssueStatus.open.value,
        source_type=resolved_source.source_type.value,
        source_id=resolved_source.source_id,
        department_id=resolved_source.department_id,
        owner_user_id=payload.owner_user_id,
        created_by_id=current_user.id,
        opened_at=now,
        due_at=due_at,
    )
    db.add(issue)
    await db.flush()

    remediation = IssueRemediationPlan(
        issue_id=issue.id,
        status=IssueRemediationStatus.draft.value,
        progress_percent=0,
        owner_user_id=payload.owner_user_id,
        target_date=due_at,
    )
    db.add(remediation)
    await db.flush()

    link_result = await ensure_issue_source_link(
        db,
        issue_id=issue.id,
        link_values=resolved_source.link_values,
        is_source_link=True,
    )
    if link_result is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contextual source link is required")
    link, _link_created = link_result

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=issue.department_id,
        description=f"Created contextual issue: {issue.title}",
    )
    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.LINK,
        actor=current_user,
        department_id=issue.department_id,
        changes={"link_id": {"old": None, "new": link.id}},
        description=f"Linked contextual source to issue {issue.title}",
    )

    await db.commit()
    reloaded_issue = await _get_issue_with_relations(db, issue.id)
    if reloaded_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    capabilities = await issue_capabilities(db, current_user=current_user, issue=reloaded_issue)
    return _serialize_issue_read(reloaded_issue, current_user=current_user, capabilities=capabilities)
