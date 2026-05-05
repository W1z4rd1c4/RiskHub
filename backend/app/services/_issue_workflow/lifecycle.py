from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.schemas.issue import (
    IssueAssignRequest,
    IssueCloseRequest,
    IssueExceptionApproveRequest,
    IssueExceptionRequestCreate,
    IssueExceptionRevokeRequest,
    IssueProgressUpdateRequest,
    IssueStartRemediationRequest,
)
from app.services._issue_register import serialize_issue_read_for_actor
from app.services._issue_workflow.contracts import (
    IssueExceptionSelection,
    IssueOutboxPlan,
    IssueUpdatePlan,
    IssueWorkflowOutcome,
)
from app.services._issue_workflow.exception_selection import (
    select_exception_for_approval,
    select_exception_for_revocation,
)
from app.services._issue_workflow.loading import (
    get_issue_with_relations as _get_issue_with_relations,
    get_readable_issue_or_404 as _get_readable_issue_or_404,
    get_writable_issue_or_404 as _get_writable_issue_or_404,
)
from app.services._issue_workflow.outbox import (
    enqueue_issue_outbox,
    issue_assigned_outbox_plan,
    issue_exception_approved_outbox_plan,
    issue_exception_requested_outbox_plan,
)
from app.services._issue_workflow.serialization import (
    active_exception as _active_exception,
    serialize_exception_with_user_names as _serialize_exception_with_user_names,
)
from app.services._issue_workflow.source_validation import (
    ensure_owner_assignable as _ensure_owner_assignable,
    validate_user_exists as _validate_user_exists,
)
from app.services._issue_workflow.execution import update_issue_detail
from app.services.issue_workflow_service import IssueWorkflowService


async def _serialize_refreshed_issue(db: AsyncSession, *, issue_id: int, current_user: User) -> IssueWorkflowOutcome:
    refreshed = await _get_issue_with_relations(db, issue_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    response = await serialize_issue_read_for_actor(db, current_user=current_user, issue=refreshed)
    return IssueWorkflowOutcome(response=response)


async def _enqueue_issue_outbox(db: AsyncSession, plan: IssueOutboxPlan) -> None:
    await enqueue_issue_outbox(db, plan)


async def assign_issue_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueAssignRequest,
    current_user: User,
) -> IssueWorkflowOutcome:
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
    await _enqueue_issue_outbox(
        db,
        issue_assigned_outbox_plan(issue=issue, owner_user_id=payload.owner_user_id, actor_id=current_user.id),
    )
    await db.commit()
    return await _serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def start_remediation_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueStartRemediationRequest,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await IssueWorkflowService.start_remediation(
        db,
        issue=issue,
        target_date=payload.target_date,
        actor=current_user,
    )
    await db.commit()
    return await _serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def update_remediation_progress_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueProgressUpdateRequest,
    current_user: User,
) -> IssueWorkflowOutcome:
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
    return await _serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def close_issue_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueCloseRequest,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await IssueWorkflowService.close_issue(
        db,
        issue=issue,
        validation_note=payload.validation_note,
        completion_notes=payload.completion_notes,
        actor=current_user,
    )
    await db.commit()
    return await _serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def request_exception_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueExceptionRequestCreate,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    exception = await IssueWorkflowService.request_exception(
        db,
        issue=issue,
        reason=payload.reason,
        actor=current_user,
    )
    await _enqueue_issue_outbox(
        db,
        issue_exception_requested_outbox_plan(issue=issue, exception=exception, actor_id=current_user.id),
    )
    await db.commit()
    await db.refresh(exception)
    response = await _serialize_exception_with_user_names(db, exception)
    return IssueWorkflowOutcome(response=response)


async def approve_exception_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueExceptionApproveRequest,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    active = _active_exception(issue)
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Issue already has an active approved exception",
        )

    selection = await select_exception_for_approval(
        db,
        issue_id=issue.id,
        exception_id=payload.exception_id,
    )
    if selection.exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested exception not found")

    approved = await IssueWorkflowService.approve_exception(
        db,
        issue=issue,
        exception=selection.exception,
        expires_at=payload.expires_at,
        actor=current_user,
    )
    await _enqueue_issue_outbox(
        db,
        issue_exception_approved_outbox_plan(issue=issue, approved=approved, actor_id=current_user.id),
    )
    await db.commit()
    await db.refresh(approved)
    response = await _serialize_exception_with_user_names(db, approved)
    return IssueWorkflowOutcome(response=response)


async def revoke_exception_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueExceptionRevokeRequest,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    selection = await select_exception_for_revocation(
        db,
        issue_id=issue.id,
        exception_id=payload.exception_id,
    )
    if selection.exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approved exception not found")

    revoked = await IssueWorkflowService.revoke_exception(
        db,
        issue=issue,
        exception=selection.exception,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(revoked)
    response = await _serialize_exception_with_user_names(db, revoked)
    return IssueWorkflowOutcome(response=response)
