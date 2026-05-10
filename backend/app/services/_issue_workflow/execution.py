from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status

from app.core.activity_logger import build_change_set
from app.core.audit.issue import issue_linked, issue_updated
from app.models import User
from app.schemas.issue import (
    IssueAssignRequest,
    IssueCloseRequest,
    IssueExceptionApproveRequest,
    IssueExceptionRead,
    IssueExceptionRequestCreate,
    IssueExceptionRevokeRequest,
    IssueProgressUpdateRequest,
    IssueRead,
    IssueStartRemediationRequest,
    IssueUpdate,
)
from app.services._issue_workflow.assignment import assign_issue, ensure_owner_assignable, validate_user_exists
from app.services._issue_workflow.closure import close_issue
from app.services._issue_workflow.contracts import IssueWorkflowOutcome
from app.services._issue_workflow.exception_selection import (
    select_exception_for_approval,
    select_exception_for_revocation,
)
from app.services._issue_workflow.exceptions import approve_exception, request_exception, revoke_exception
from app.services._issue_workflow.loading import (
    get_issue_with_relations,
    get_readable_issue_or_404,
    get_writable_issue_or_404,
)
from app.services._issue_workflow.outbox import (
    enqueue_issue_outbox,
    issue_assigned_outbox_plan,
    issue_exception_approved_outbox_plan,
    issue_exception_requested_outbox_plan,
)
from app.services._issue_workflow.remediation import start_remediation, update_progress
from app.services._issue_workflow.serialization import (
    active_exception,
    serialize_exception_with_user_names,
    serialize_refreshed_issue,
)
from app.services._issue_workflow.source_validation import (
    clear_issue_source_links,
    ensure_issue_source_link,
    resolve_issue_source_metadata,
)
from app.services._issue_workflow.update_plans import build_issue_update_plan


async def update_issue_detail(
    *,
    db,
    issue_id: int,
    payload: IssueUpdate,
    current_user,
) -> IssueWorkflowOutcome[IssueRead]:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    plan = await build_issue_update_plan(db=db, issue=issue, payload=payload, current_user=current_user)
    changes = build_change_set(issue, plan.updates)

    for key, value in plan.updates.items():
        setattr(issue, key, value)
    db.add(issue)
    await db.flush()

    source_link = None
    source_link_created = False
    if plan.source_link_requested:
        await clear_issue_source_links(db, issue_id=issue.id)
        resolved_source = await resolve_issue_source_metadata(
            db,
            current_user,
            source_type=issue.source_type,
            source_id=issue.source_id,
        )
        if resolved_source is not None:
            source_link_result = await ensure_issue_source_link(
                db,
                issue_id=issue.id,
                link_values=resolved_source.link_values,
                is_source_link=True,
            )
            if source_link_result is not None:
                source_link, source_link_created = source_link_result
        db.expire(issue, ["links"])

    await issue_updated(db, actor=current_user, issue=issue, changes=changes)
    if source_link is not None and source_link_created:
        await issue_linked(
            db,
            actor=current_user,
            issue=issue,
            link=source_link,
            description=f"Linked issue source to issue {issue.title}",
        )

    await db.commit()
    if await get_issue_with_relations(db, issue.id) is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return await serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def assign_issue_detail(
    *,
    db,
    issue_id: int,
    payload: IssueAssignRequest,
    current_user: User,
) -> IssueWorkflowOutcome[IssueRead]:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    await validate_user_exists(db, payload.owner_user_id)
    await ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=issue.department_id,
    )
    await assign_issue(
        db,
        issue=issue,
        owner_user_id=payload.owner_user_id,
        due_at=payload.due_at,
        target_date=payload.target_date,
        actor=current_user,
    )
    await enqueue_issue_outbox(
        db,
        issue_assigned_outbox_plan(
            issue=issue,
            owner_user_id=payload.owner_user_id,
            actor_id=current_user.id,
            assignment_event_id=str(uuid4()),
        ),
    )
    await db.commit()
    return await serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def start_remediation_detail(
    *,
    db,
    issue_id: int,
    payload: IssueStartRemediationRequest,
    current_user: User,
) -> IssueWorkflowOutcome[IssueRead]:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    await start_remediation(
        db,
        issue=issue,
        target_date=payload.target_date,
        actor=current_user,
    )
    await db.commit()
    return await serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def update_remediation_progress_detail(
    *,
    db,
    issue_id: int,
    payload: IssueProgressUpdateRequest,
    current_user: User,
) -> IssueWorkflowOutcome[IssueRead]:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    remediation_status = payload.remediation_status.value if payload.remediation_status else None
    await update_progress(
        db,
        issue=issue,
        progress_percent=payload.progress_percent,
        remediation_status=remediation_status,
        blocker_reason=payload.blocker_reason,
        completion_notes=payload.completion_notes,
        actor=current_user,
    )
    await db.commit()
    return await serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def close_issue_detail(
    *,
    db,
    issue_id: int,
    payload: IssueCloseRequest,
    current_user: User,
) -> IssueWorkflowOutcome[IssueRead]:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    await close_issue(
        db,
        issue=issue,
        validation_note=payload.validation_note,
        completion_notes=payload.completion_notes,
        actor=current_user,
    )
    await db.commit()
    return await serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)


async def request_exception_detail(
    *,
    db,
    issue_id: int,
    payload: IssueExceptionRequestCreate,
    current_user: User,
) -> IssueWorkflowOutcome[IssueExceptionRead]:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    exception = await request_exception(
        db,
        issue=issue,
        reason=payload.reason,
        actor=current_user,
    )
    await enqueue_issue_outbox(
        db,
        issue_exception_requested_outbox_plan(issue=issue, exception=exception, actor_id=current_user.id),
    )
    await db.commit()
    await db.refresh(exception)
    response = await serialize_exception_with_user_names(db, exception)
    return IssueWorkflowOutcome(response=response)


async def approve_exception_detail(
    *,
    db,
    issue_id: int,
    payload: IssueExceptionApproveRequest,
    current_user: User,
) -> IssueWorkflowOutcome[IssueExceptionRead]:
    issue = await get_readable_issue_or_404(db, issue_id, current_user)
    active = active_exception(issue)
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Issue already has an active approved exception",
        )

    selection = await select_exception_for_approval(db, issue_id=issue.id, exception_id=payload.exception_id)
    if selection.exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested exception not found")

    approved = await approve_exception(
        db,
        issue=issue,
        exception=selection.exception,
        expires_at=payload.expires_at,
        actor=current_user,
    )
    await enqueue_issue_outbox(
        db,
        issue_exception_approved_outbox_plan(issue=issue, approved=approved, actor_id=current_user.id),
    )
    await db.commit()
    await db.refresh(approved)
    response = await serialize_exception_with_user_names(db, approved)
    return IssueWorkflowOutcome(response=response)


async def revoke_exception_detail(
    *,
    db,
    issue_id: int,
    payload: IssueExceptionRevokeRequest,
    current_user: User,
) -> IssueWorkflowOutcome[IssueExceptionRead]:
    issue = await get_readable_issue_or_404(db, issue_id, current_user)
    selection = await select_exception_for_revocation(db, issue_id=issue.id, exception_id=payload.exception_id)
    if selection.exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approved exception not found")

    revoked = await revoke_exception(
        db,
        issue=issue,
        exception=selection.exception,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(revoked)
    response = await serialize_exception_with_user_names(db, revoked)
    return IssueWorkflowOutcome(response=response)
