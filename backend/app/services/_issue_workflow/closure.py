from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.models import Issue, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueStatus

from .transitions import _completion_updates, _conflict, _get_or_init_remediation, _is_remediation_complete


async def close_issue(
    db: AsyncSession,
    *,
    issue: Issue,
    validation_note: str,
    completion_notes: str | None,
    actor: User,
) -> Issue:
    remediation = _get_or_init_remediation(issue)
    if not _is_remediation_complete(remediation):
        _conflict("Issue cannot be closed until remediation is completed")

    if issue.status != IssueStatus.ready_for_validation.value:
        _conflict(f"Issue must be ready_for_validation before closing (current={issue.status})")

    now = utc_now()
    issue_updates = {
        "status": IssueStatus.closed.value,
        "closed_at": now,
        "validation_note": validation_note,
    }
    issue_changes = build_change_set(issue, issue_updates)
    for key, value in issue_updates.items():
        setattr(issue, key, value)

    remediation_updates: dict[str, object] = _completion_updates(remediation, now)
    if completion_notes is not None:
        remediation_updates["completion_notes"] = completion_notes
    remediation_changes = build_change_set(remediation, remediation_updates)
    for key, value in remediation_updates.items():
        setattr(remediation, key, value)

    db.add(issue)
    db.add(remediation)

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.STATUS_CHANGE,
        actor=actor,
        department_id=issue.department_id,
        changes=issue_changes,
        description=f"Closed issue {issue.title}",
    )
    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE_REMEDIATION,
        entity_id=remediation.id or issue.id,
        entity_name=f"Remediation for {issue.title}",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=issue.department_id,
        changes=remediation_changes,
    )
    return issue
