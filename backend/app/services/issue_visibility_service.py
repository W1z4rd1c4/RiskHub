from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import exists, select
from sqlalchemy.sql.elements import ColumnElement

from app.models.issue import Issue, IssueException, IssueExceptionStatus


def coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def issue_has_active_approved_exception(issue: Issue, now: datetime) -> bool:
    for exception in issue.exceptions:
        if exception.status != IssueExceptionStatus.approved.value:
            continue
        expires_at = coerce_utc(exception.expires_at)
        if expires_at is not None and expires_at > now:
            return True
    return False


def unsuppressed_issue_clause(now: datetime) -> ColumnElement[bool]:
    utc_now = coerce_utc(now) or datetime.now(UTC)
    return ~exists(
        select(IssueException.id).where(
            IssueException.issue_id == Issue.id,
            IssueException.status == IssueExceptionStatus.approved.value,
            IssueException.expires_at.is_not(None),
            IssueException.expires_at > utc_now,
        )
    )
