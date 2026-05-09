from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set
from app.core.audit.issue import (
    issue_remediation_status_changed,
    issue_remediation_updated,
    issue_status_changed,
)
from app.core.datetime_utils import coerce_utc, utc_now
from app.models import Issue, User
from app.models.issue import IssueRemediationStatus, IssueStatus

from .transitions import (
    _completion_updates,
    _conflict,
    _ensure_issue_transition,
    _ensure_remediation_transition,
    _get_or_init_remediation,
    _is_remediation_complete,
    _status_value,
)


async def start_remediation(
    db: AsyncSession,
    *,
    issue: Issue,
    actor: User,
    target_date: datetime | None = None,
) -> Issue:
    if issue.status not in {IssueStatus.open.value, IssueStatus.triaged.value}:
        _conflict(f"Issue must be open or triaged to start remediation (current={issue.status})")

    remediation = _get_or_init_remediation(issue)
    target_date = coerce_utc(target_date) or remediation.target_date or issue.due_at

    _ensure_issue_transition(issue.status, IssueStatus.in_progress.value)
    issue_updates = {"status": IssueStatus.in_progress.value}
    issue_changes = build_change_set(issue, issue_updates)
    issue.status = IssueStatus.in_progress

    remediation_updates = {
        "status": IssueRemediationStatus.active.value,
        "target_date": target_date,
    }
    remediation_changes = build_change_set(remediation, remediation_updates)
    remediation.status = IssueRemediationStatus.active
    remediation.target_date = target_date

    db.add(issue)
    db.add(remediation)

    await issue_status_changed(
        db,
        actor=actor,
        issue=issue,
        changes=issue_changes,
        description=f"Started remediation for issue {issue.title}",
    )
    await issue_remediation_status_changed(
        db,
        actor=actor,
        issue=issue,
        plan=remediation,
        changes=remediation_changes,
    )
    return issue


async def update_progress(
    db: AsyncSession,
    *,
    issue: Issue,
    actor: User,
    progress_percent: int | None = None,
    remediation_status: str | None = None,
    blocker_reason: str | None = None,
    completion_notes: str | None = None,
) -> Issue:
    remediation = _get_or_init_remediation(issue)
    if issue.status not in {IssueStatus.in_progress.value, IssueStatus.ready_for_validation.value}:
        _conflict(f"Issue must be in progress to update remediation (current={issue.status})")

    remediation_updates: dict[str, object] = {}
    target_status = _status_value(remediation_status)
    if progress_percent is not None:
        if progress_percent < 0 or progress_percent > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="progress_percent must be between 0 and 100",
            )
        remediation_updates["progress_percent"] = progress_percent
    if progress_percent == 100 and target_status in {
        IssueRemediationStatus.active.value,
        IssueRemediationStatus.blocked.value,
    }:
        _conflict("Cannot mark remediation active or blocked with 100% progress")
    if (
        target_status == IssueRemediationStatus.completed.value
        and progress_percent is not None
        and progress_percent < 100
    ):
        _conflict("Completed remediation requires 100% progress")

    if remediation_status is not None:
        reactivating_ready_issue = (
            _status_value(issue.status) == IssueStatus.ready_for_validation.value
            and _status_value(remediation.status) == IssueRemediationStatus.completed.value
            and target_status in {IssueRemediationStatus.active.value, IssueRemediationStatus.blocked.value}
        )
        if not reactivating_ready_issue:
            _ensure_remediation_transition(remediation.status, remediation_status)
        remediation_updates["status"] = target_status
    if blocker_reason is not None:
        remediation_updates["blocker_reason"] = blocker_reason
    if completion_notes is not None:
        remediation_updates["completion_notes"] = completion_notes

    if target_status == IssueRemediationStatus.completed.value or progress_percent == 100:
        now = utc_now()
        remediation_updates.update(_completion_updates(remediation, now))

    remediation_changes = build_change_set(remediation, remediation_updates)
    for key, value in remediation_updates.items():
        setattr(remediation, key, value)

    issue_updates: dict[str, object] = {}
    if (
        _is_remediation_complete(remediation)
        and _status_value(issue.status) != IssueStatus.ready_for_validation.value
    ):
        _ensure_issue_transition(issue.status, IssueStatus.ready_for_validation.value)
        issue_updates["status"] = IssueStatus.ready_for_validation.value
    elif (
        not _is_remediation_complete(remediation)
        and _status_value(issue.status) == IssueStatus.ready_for_validation.value
    ):
        _ensure_issue_transition(issue.status, IssueStatus.in_progress.value)
        issue_updates["status"] = IssueStatus.in_progress.value

    issue_changes = build_change_set(issue, issue_updates)
    for key, value in issue_updates.items():
        setattr(issue, key, value)

    db.add(issue)
    db.add(remediation)

    await issue_remediation_updated(
        db,
        actor=actor,
        issue=issue,
        plan=remediation,
        changes=remediation_changes,
        description=f"Updated remediation progress for issue {issue.title}",
    )
    if issue_changes:
        await issue_status_changed(db, actor=actor, issue=issue, changes=issue_changes)
    return issue
