from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set
from app.core.audit.issue import (
    issue_exception_approved,
    issue_exception_created,
    issue_exception_status_changed,
    issue_status_changed,
)
from app.core.datetime_utils import coerce_utc, utc_now
from app.models import Issue, IssueException, User
from app.models.issue import IssueExceptionStatus, IssueStatus

from .transitions import _conflict, _ensure_issue_not_closed, _is_remediation_complete, _status_value


async def request_exception(
    db: AsyncSession,
    *,
    issue: Issue,
    reason: str,
    actor: User,
) -> IssueException:
    _ensure_issue_not_closed(issue, "request an exception for")

    now = utc_now()
    for existing_exception in issue.exceptions:
        expires_at = coerce_utc(existing_exception.expires_at)
        if (
            existing_exception.status == IssueExceptionStatus.approved.value
            and expires_at is not None
            and expires_at > now
        ):
            _conflict("Issue already has an active approved exception")

    exception = IssueException(
        issue_id=issue.id,
        status=IssueExceptionStatus.requested.value,
        reason=reason,
        requested_by_id=actor.id,
        requested_at=now,
    )
    db.add(exception)
    await db.flush()

    await issue_exception_created(
        db,
        actor=actor,
        issue=issue,
        exception=exception,
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
    _ensure_issue_not_closed(issue, "approve an exception for")

    if exception.status != IssueExceptionStatus.requested.value:
        _conflict(f"Only requested exceptions can be approved (current={exception.status})")

    if exception.requested_by_id is not None and exception.requested_by_id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users cannot approve their own exception requests",
        )

    coerced_expires_at = coerce_utc(expires_at)
    if coerced_expires_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expires_at is required")
    now = utc_now()
    if coerced_expires_at <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expires_at must be in the future")
    updates = {
        "status": IssueExceptionStatus.approved.value,
        "approved_by_id": actor.id,
        "approved_at": now,
        "expires_at": coerced_expires_at,
    }
    changes = build_change_set(exception, updates)
    for key, exception_value in updates.items():
        setattr(exception, key, exception_value)
    db.add(exception)

    await issue_exception_approved(db, actor=actor, issue=issue, exception=exception, changes=changes)
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

    expires_at = coerce_utc(exception.expires_at)
    if expires_at is None or expires_at <= utc_now():
        _conflict("Cannot revoke an expired exception")

    updates = {
        "status": IssueExceptionStatus.revoked.value,
    }
    changes = build_change_set(exception, updates)
    for key, exception_value in updates.items():
        setattr(exception, key, exception_value)
    db.add(exception)

    await issue_exception_status_changed(
        db,
        actor=actor,
        issue=issue,
        exception=exception,
        changes=changes,
        description=f"Revoked exception for issue {issue.title}",
    )

    if _status_value(issue.status) == IssueStatus.closed.value and not _is_remediation_complete(issue.remediation_plan):
        issue_updates = {
            "status": IssueStatus.in_progress.value,
            "closed_at": None,
        }
        issue_changes = build_change_set(issue, issue_updates)
        for key, issue_value in issue_updates.items():
            setattr(issue, key, issue_value)
        db.add(issue)

        await issue_status_changed(
            db,
            actor=actor,
            issue=issue,
            changes=issue_changes,
            description=f"Re-opened issue after exception revocation: {issue.title}",
        )

    return exception
