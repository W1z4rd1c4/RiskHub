from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status

from app.core.activity_logger import build_change_set
from app.core.audit.issue import issue_created, issue_linked, issue_updated
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import can_access_department_id
from app.models import Issue, IssueRemediationPlan, User
from app.models.issue import IssueRemediationStatus, IssueStatus
from app.schemas.issue import (
    IssueAssignRequest,
    IssueCloseRequest,
    IssueContextualCreate,
    IssueCreate,
    IssueExceptionApproveRequest,
    IssueExceptionRead,
    IssueExceptionRequestCreate,
    IssueExceptionRevokeRequest,
    IssueProgressUpdateRequest,
    IssueRead,
    IssueStartRemediationRequest,
    IssueUpdate,
)
from app.services._issue_register import resolve_contextual_issue_source, serialize_issue_read_for_actor
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
from app.services.transaction_boundary import commit_service_boundary


async def create_issue_detail(
    *,
    db,
    payload: IssueCreate,
    current_user: User,
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

    await validate_user_exists(db, payload.owner_user_id)
    await ensure_owner_assignable(db, owner_user_id=payload.owner_user_id, department_id=payload.department_id)

    due_at = coerce_utc(payload.due_at)
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
        due_at=due_at,
    )
    db.add(issue)
    await db.flush()

    db.add(
        IssueRemediationPlan(
            issue_id=issue.id,
            status=IssueRemediationStatus.draft.value,
            progress_percent=0,
            owner_user_id=payload.owner_user_id,
            target_date=due_at,
        )
    )
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

    await commit_service_boundary(db, boundary="issue_workflow.create_issue")
    refreshed = await get_issue_with_relations(db, issue.id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return await serialize_issue_read_for_actor(db, current_user=current_user, issue=refreshed)


async def create_contextual_issue_detail(
    *,
    db,
    payload: IssueContextualCreate,
    current_user: User,
) -> IssueRead:
    resolved_source = await resolve_contextual_issue_source(
        db,
        current_user,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
    )

    await validate_user_exists(db, payload.owner_user_id)
    await ensure_owner_assignable(
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

    db.add(
        IssueRemediationPlan(
            issue_id=issue.id,
            status=IssueRemediationStatus.draft.value,
            progress_percent=0,
            owner_user_id=payload.owner_user_id,
            target_date=due_at,
        )
    )
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

    await issue_created(db, actor=current_user, issue=issue)
    await issue_linked(
        db,
        actor=current_user,
        issue=issue,
        link=link,
        description=f"Linked contextual source to issue {issue.title}",
    )

    await commit_service_boundary(db, boundary="issue_workflow.create_contextual_issue")
    refreshed = await get_issue_with_relations(db, issue.id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return await serialize_issue_read_for_actor(db, current_user=current_user, issue=refreshed)


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
