from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.issue import issue_created, issue_linked
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import can_access_department_id
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Issue, IssueRemediationPlan, User
from app.models.issue import IssueStatus
from app.schemas.issue import IssueCreate, IssueRead
from app.services._issue_register import (
    ensure_issue_source_link,
    resolve_issue_source_metadata,
    serialize_issue_read_for_actor,
)
from app.services.transaction_boundary import commit_service_transaction

from .._shared import (
    _ensure_owner_assignable,
    _get_issue_with_relations,
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
    resolved_source = await resolve_issue_source_metadata(
        db,
        current_user,
        source_type=payload.source_type,
        source_id=payload.source_id,
    )
    if resolved_source is not None and resolved_source.department_id != payload.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source entity department must match issue department",
        )

    await _validate_user_exists(db, payload.owner_user_id)
    await _ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=payload.department_id,
    )

    now = utc_now()
    issue = Issue(
        title=payload.title,
        description=payload.description,
        severity=payload.severity.value,
        status=IssueStatus.open.value,
        source_type=(resolved_source.source_type.value if resolved_source is not None else payload.source_type.value),
        source_id=(resolved_source.source_id if resolved_source is not None else None),
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

    source_link = None
    source_link_created = False
    if resolved_source is not None:
        source_link_result = await ensure_issue_source_link(
            db,
            issue_id=issue.id,
            link_values=resolved_source.link_values,
            is_source_link=True,
        )
        if source_link_result is not None:
            source_link, source_link_created = source_link_result

    await issue_created(db, actor=current_user, issue=issue)
    if source_link is not None and source_link_created:
        await issue_linked(
            db,
            actor=current_user,
            issue=issue,
            link=source_link,
            description=f"Linked issue source to issue {issue.title}",
        )

    await commit_service_transaction(db)
    reloaded_issue = await _get_issue_with_relations(db, issue.id)
    if reloaded_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return await serialize_issue_read_for_actor(db, current_user=current_user, issue=reloaded_issue)
