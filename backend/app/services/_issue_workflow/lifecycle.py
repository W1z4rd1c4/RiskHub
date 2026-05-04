from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import can_access_department_id
from app.models import IssueException, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueExceptionStatus
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
from app.services._issue_register import serialize_issue_read_for_actor
from app.services._issue_workflow.loading import (
    get_issue_with_relations as _get_issue_with_relations,
    get_readable_issue_or_404 as _get_readable_issue_or_404,
    get_writable_issue_or_404 as _get_writable_issue_or_404,
)
from app.services._issue_workflow.outbox import enqueue_issue_outbox
from app.services._issue_workflow.serialization import (
    active_exception as _active_exception,
    serialize_exception_with_user_names as _serialize_exception_with_user_names,
)
from app.services._issue_workflow.source_validation import (
    clear_issue_source_links,
    ensure_issue_source_link,
    ensure_owner_assignable as _ensure_owner_assignable,
    issue_link_department_ids as _issue_link_department_ids,
    resolve_issue_source_metadata,
    validate_user_exists as _validate_user_exists,
)
from app.services.issue_workflow_service import IssueWorkflowService

CONCRETE_SOURCE_TYPES = {"control_execution", "kri_breach"}


@dataclass(frozen=True)
class IssueWorkflowOutcome:
    response: IssueRead | IssueExceptionRead


@dataclass(frozen=True)
class IssueUpdatePlan:
    updates: dict[str, Any]
    source_link_requested: bool


@dataclass(frozen=True)
class IssueExceptionSelection:
    exception: IssueException | None


@dataclass(frozen=True)
class IssueOutboxPlan:
    event_type: str
    aggregate_type: str
    aggregate_id: int
    idempotency_key: str
    payload: dict[str, Any]


def _source_type_value(source_type: Any) -> str:
    return source_type.value if hasattr(source_type, "value") else str(source_type)


async def _serialize_refreshed_issue(db: AsyncSession, *, issue_id: int, current_user: User) -> IssueWorkflowOutcome:
    refreshed = await _get_issue_with_relations(db, issue_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    response = await serialize_issue_read_for_actor(db, current_user=current_user, issue=refreshed)
    return IssueWorkflowOutcome(response=response)


async def _enqueue_issue_outbox(db: AsyncSession, plan: IssueOutboxPlan) -> None:
    await enqueue_issue_outbox(db, plan)


async def update_issue_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueUpdate,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    updates = payload.model_dump(exclude_unset=True)

    if "status" in updates:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use workflow endpoints to change issue status",
        )

    target_department_id = issue.department_id
    if "owner_user_id" in updates:
        await _validate_user_exists(db, updates.get("owner_user_id"))
    if "department_id" in updates:
        new_dept_id = updates.get("department_id")
        if new_dept_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id cannot be null")
        if not can_access_department_id(current_user, new_dept_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")
        target_department_id = new_dept_id

        if new_dept_id != issue.department_id:
            link_department_ids = await _issue_link_department_ids(db, issue.id)
            if any(link_department_id != new_dept_id for link_department_id in link_department_ids):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Cannot change department while links point to entities in another department; "
                        "relink/unlink first"
                    ),
                )

    if "owner_user_id" in updates:
        await _ensure_owner_assignable(
            db,
            owner_user_id=updates.get("owner_user_id"),
            department_id=target_department_id,
        )
    elif "department_id" in updates and issue.owner_user_id is not None:
        await _ensure_owner_assignable(
            db,
            owner_user_id=issue.owner_user_id,
            department_id=target_department_id,
            denied_status=status.HTTP_409_CONFLICT,
        )

    if "source_type" in updates or "source_id" in updates:
        if updates.get("source_type") is None and "source_type" in updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_type cannot be null")
        new_source_type = updates.get("source_type", issue.source_type)
        current_source_type_value = _source_type_value(issue.source_type)
        new_source_type_value = _source_type_value(new_source_type)
        missing_source_id_for_concrete_switch = (
            "source_type" in updates
            and "source_id" not in updates
            and new_source_type_value in CONCRETE_SOURCE_TYPES
            and current_source_type_value != new_source_type_value
        )
        if missing_source_id_for_concrete_switch:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_id is required")
        if "source_id" in updates:
            new_source_id = updates["source_id"]
        elif "source_type" in updates and new_source_type_value in {"manual", "audit"}:
            new_source_id = None
        else:
            new_source_id = issue.source_id
        resolved_source = await resolve_issue_source_metadata(
            db,
            current_user,
            source_type=new_source_type,
            source_id=new_source_id,
        )
        if resolved_source is not None:
            if resolved_source.department_id != target_department_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Source entity department must match issue department",
                )
            updates["source_type"] = resolved_source.source_type
            updates["source_id"] = resolved_source.source_id
        else:
            updates["source_id"] = None

    if "due_at" in updates:
        updates["due_at"] = coerce_utc(updates["due_at"])
    if "severity" in updates and updates["severity"] is not None:
        updates["severity"] = updates["severity"].value
    if "source_type" in updates and updates["source_type"] is not None:
        updates["source_type"] = updates["source_type"].value

    changes = build_change_set(issue, updates)
    for key, value in updates.items():
        setattr(issue, key, value)
    db.add(issue)
    await db.flush()

    source_link = None
    source_link_created = False
    if "source_type" in updates or "source_id" in updates:
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

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=issue.department_id,
        changes=changes,
    )
    if source_link is not None and source_link_created:
        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE,
            entity_id=issue.id,
            entity_name=issue.title,
            action=ActivityAction.LINK,
            actor=current_user,
            department_id=issue.department_id,
            changes={"link_id": {"old": None, "new": source_link.id}},
            description=f"Linked issue source to issue {issue.title}",
        )

    await db.commit()
    reloaded_issue = await _get_issue_with_relations(db, issue.id)
    if reloaded_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    response = await serialize_issue_read_for_actor(db, current_user=current_user, issue=reloaded_issue)
    return IssueWorkflowOutcome(response=response)


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
        IssueOutboxPlan(
            event_type="issue.assigned",
            aggregate_type="issue",
            aggregate_id=issue.id,
            idempotency_key=f"issue:{issue.id}:assigned:{payload.owner_user_id}:{current_user.id}",
            payload={
                "issue_id": issue.id,
                "owner_user_id": payload.owner_user_id,
                "actor_user_id": current_user.id,
            },
        ),
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
        IssueOutboxPlan(
            event_type="issue.exception_requested",
            aggregate_type="issue_exception",
            aggregate_id=exception.id,
            idempotency_key=f"issue:{issue.id}:exception-requested:{exception.id}",
            payload={
                "issue_id": issue.id,
                "actor_user_id": current_user.id,
            },
        ),
    )
    await db.commit()
    await db.refresh(exception)
    response = await _serialize_exception_with_user_names(db, exception)
    return IssueWorkflowOutcome(response=response)


async def _select_exception_for_approval(
    db: AsyncSession,
    *,
    issue_id: int,
    exception_id: int | None,
) -> IssueExceptionSelection:
    if exception_id is not None:
        exception = (
            await db.execute(
                select(IssueException).where(
                    IssueException.id == exception_id,
                    IssueException.issue_id == issue_id,
                )
            )
        ).scalar_one_or_none()
        return IssueExceptionSelection(exception=exception)

    exception = (
        (
            await db.execute(
                select(IssueException)
                .where(
                    IssueException.issue_id == issue_id,
                    IssueException.status == IssueExceptionStatus.requested.value,
                )
                .order_by(IssueException.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    return IssueExceptionSelection(exception=exception)


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

    selection = await _select_exception_for_approval(
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
        IssueOutboxPlan(
            event_type="issue.exception_approved",
            aggregate_type="issue_exception",
            aggregate_id=approved.id,
            idempotency_key=f"issue:{issue.id}:exception-approved:{approved.id}",
            payload={
                "issue_id": issue.id,
                "requested_by_id": approved.requested_by_id,
                "owner_user_id": issue.owner_user_id,
                "actor_user_id": current_user.id,
            },
        ),
    )
    await db.commit()
    await db.refresh(approved)
    response = await _serialize_exception_with_user_names(db, approved)
    return IssueWorkflowOutcome(response=response)


async def _select_exception_for_revocation(
    db: AsyncSession,
    *,
    issue_id: int,
    exception_id: int | None,
) -> IssueExceptionSelection:
    if exception_id is not None:
        exception = (
            await db.execute(
                select(IssueException).where(
                    IssueException.id == exception_id,
                    IssueException.issue_id == issue_id,
                )
            )
        ).scalar_one_or_none()
        return IssueExceptionSelection(exception=exception)

    now = utc_now()
    exception = (
        (
            await db.execute(
                select(IssueException)
                .where(
                    IssueException.issue_id == issue_id,
                    IssueException.status == IssueExceptionStatus.approved.value,
                    IssueException.expires_at.is_not(None),
                    IssueException.expires_at > now,
                )
                .order_by(IssueException.approved_at.desc(), IssueException.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    return IssueExceptionSelection(exception=exception)


async def revoke_exception_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueExceptionRevokeRequest,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    selection = await _select_exception_for_revocation(
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
