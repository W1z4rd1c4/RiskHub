from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import coerce_utc
from app.models import Issue, IssueException, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueExceptionStatus, IssueRemediationStatus, IssueStatus

from .transitions import _conflict


async def request_exception(
    db: AsyncSession,
    *,
    issue: Issue,
    reason: str,
    actor: User,
) -> IssueException:
    now = datetime.now(UTC)
    exception = IssueException(
        issue_id=issue.id,
        status=IssueExceptionStatus.requested.value,
        reason=reason,
        requested_by_id=actor.id,
        requested_at=now,
    )
    db.add(exception)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE_EXCEPTION,
        entity_id=exception.id,
        entity_name=f"Exception for {issue.title}",
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=issue.department_id,
        changes={"status": {"old": None, "new": IssueExceptionStatus.requested.value}},
        description=f"Requested exception for issue {issue.title}",
    )
    return exception


async def approve_exception(
    db: AsyncSession,
    *,
    issue: Issue,
    exception: IssueException,
    expires_at: datetime,
    actor: User,
) -> IssueException:
    if exception.status != IssueExceptionStatus.requested.value:
        _conflict(f"Only requested exceptions can be approved (current={exception.status})")

    expires_at = coerce_utc(expires_at)
    if expires_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expires_at is required")
    now = datetime.now(UTC)
    if expires_at <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expires_at must be in the future")
    updates = {
        "status": IssueExceptionStatus.approved.value,
        "approved_by_id": actor.id,
        "approved_at": now,
        "expires_at": expires_at,
    }
    changes = build_change_set(exception, updates)
    for key, value in updates.items():
        setattr(exception, key, value)
    db.add(exception)

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE_EXCEPTION,
        entity_id=exception.id,
        entity_name=f"Exception for {issue.title}",
        action=ActivityAction.APPROVE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=f"Approved exception for issue {issue.title}",
    )
    return exception


async def revoke_exception(
    db: AsyncSession,
    *,
    issue: Issue,
    exception: IssueException,
    actor: User,
) -> IssueException:
    if exception.status != IssueExceptionStatus.approved.value:
        _conflict(f"Only approved exceptions can be revoked (current={exception.status})")

    updates = {
        "status": IssueExceptionStatus.revoked.value,
    }
    changes = build_change_set(exception, updates)
    for key, value in updates.items():
        setattr(exception, key, value)
    db.add(exception)

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE_EXCEPTION,
        entity_id=exception.id,
        entity_name=f"Exception for {issue.title}",
        action=ActivityAction.STATUS_CHANGE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=f"Revoked exception for issue {issue.title}",
    )

    remediation = issue.remediation_plan
    remediation_done = (
        remediation is not None
        and remediation.status == IssueRemediationStatus.completed.value
        and remediation.progress_percent >= 100
    )
    if issue.status == IssueStatus.closed.value and not remediation_done:
        issue_updates = {
            "status": IssueStatus.in_progress.value,
            "closed_at": None,
        }
        issue_changes = build_change_set(issue, issue_updates)
        for key, value in issue_updates.items():
            setattr(issue, key, value)
        db.add(issue)

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE,
            entity_id=issue.id,
            entity_name=issue.title,
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=issue.department_id,
            changes=issue_changes,
            description=f"Re-opened issue after exception revocation: {issue.title}",
        )

    return exception
