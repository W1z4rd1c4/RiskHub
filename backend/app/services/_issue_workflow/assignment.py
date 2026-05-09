from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set
from app.core.audit.issue import issue_assigned, issue_remediation_updated
from app.core.datetime_utils import coerce_utc
from app.models import Issue, User
from app.models.issue import IssueStatus

from .transitions import _ensure_issue_not_closed, _get_or_init_remediation


async def assign_issue(
    db: AsyncSession,
    *,
    issue: Issue,
    owner_user_id: int,
    due_at: datetime,
    target_date: datetime | None,
    actor: User,
) -> Issue:
    _ensure_issue_not_closed(issue, "assign")

    due_at = coerce_utc(due_at) or due_at
    target_date = coerce_utc(target_date) or due_at
    remediation = _get_or_init_remediation(issue)

    issue_updates: dict[str, object] = {
        "owner_user_id": owner_user_id,
        "due_at": due_at,
    }
    if issue.status == IssueStatus.open.value:
        issue_updates["status"] = IssueStatus.triaged.value

    issue_changes = build_change_set(issue, issue_updates)
    for key, value in issue_updates.items():
        setattr(issue, key, value)

    remediation_updates: dict[str, object] = {
        "owner_user_id": owner_user_id,
        "target_date": target_date,
    }
    remediation_changes = build_change_set(remediation, remediation_updates)
    for key, value in remediation_updates.items():
        setattr(remediation, key, value)

    db.add(issue)
    db.add(remediation)

    await issue_assigned(db, actor=actor, issue=issue, changes=issue_changes)
    await issue_remediation_updated(
        db,
        actor=actor,
        issue=issue,
        plan=remediation,
        changes=remediation_changes,
    )
    return issue
