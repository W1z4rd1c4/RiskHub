from fastapi import APIRouter, Depends, HTTPException
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
from app.services.authorization_capabilities import issue_capabilities
from app.services.issue_workflow_service import IssueWorkflowService
from app.services.outbox import OutboxService

from ._shared import (
    _ensure_owner_assignable,
    _get_issue_with_relations,
    _get_writable_issue_or_404,
    _serialize_issue_read,
    _validate_user_exists,
)

router = APIRouter()


@router.post("/issues/{issue_id}/assign", response_model=IssueRead)
async def assign_issue(
    issue_id: int,
    payload: IssueAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await _validate_user_exists(db, payload.owner_user_id)
    await _ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=issue.department_id,
    )
    await IssueWorkflowService.assign_issue(
        db,
        issue=issue,
        owner_user_id=payload.owner_user_id,
        due_at=payload.due_at,
        target_date=payload.target_date,
        actor=current_user,
    )
    await OutboxService.enqueue(
        db,
        event_type="issue.assigned",
        aggregate_type="issue",
        aggregate_id=issue.id,
        idempotency_key=f"issue:{issue.id}:assigned:{payload.owner_user_id}:{current_user.id}",
        payload={
            "issue_id": issue.id,
            "owner_user_id": payload.owner_user_id,
            "actor_user_id": current_user.id,
        },
    )
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    capabilities = await issue_capabilities(db, current_user=current_user, issue=refreshed)
    return _serialize_issue_read(refreshed, current_user=current_user, capabilities=capabilities)


@router.post("/issues/{issue_id}/start-remediation", response_model=IssueRead)
async def start_remediation(
    issue_id: int,
    payload: IssueStartRemediationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await IssueWorkflowService.start_remediation(
        db,
        issue=issue,
        target_date=payload.target_date,
        actor=current_user,
    )
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    capabilities = await issue_capabilities(db, current_user=current_user, issue=refreshed)
    return _serialize_issue_read(refreshed, current_user=current_user, capabilities=capabilities)


@router.post("/issues/{issue_id}/update-progress", response_model=IssueRead)
async def update_remediation_progress(
    issue_id: int,
    payload: IssueProgressUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    remediation_status = payload.remediation_status.value if payload.remediation_status else None
    await IssueWorkflowService.update_progress(
        db,
        issue=issue,
        progress_percent=payload.progress_percent,
        remediation_status=remediation_status,
        blocker_reason=payload.blocker_reason,
        completion_notes=payload.completion_notes,
        actor=current_user,
    )
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    capabilities = await issue_capabilities(db, current_user=current_user, issue=refreshed)
    return _serialize_issue_read(refreshed, current_user=current_user, capabilities=capabilities)


@router.post("/issues/{issue_id}/close", response_model=IssueRead)
async def close_issue(
    issue_id: int,
    payload: IssueCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await IssueWorkflowService.close_issue(
        db,
        issue=issue,
        validation_note=payload.validation_note,
        completion_notes=payload.completion_notes,
        actor=current_user,
    )
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    capabilities = await issue_capabilities(db, current_user=current_user, issue=refreshed)
    return _serialize_issue_read(refreshed, current_user=current_user, capabilities=capabilities)
