from __future__ import annotations

from fastapi import HTTPException, status

from app.models import Issue, IssueRemediationPlan
from app.models.issue import IssueRemediationStatus, IssueStatus


def _conflict(detail: str) -> None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


ISSUE_TRANSITIONS: dict[str, set[str]] = {
    IssueStatus.open.value: {IssueStatus.triaged.value, IssueStatus.in_progress.value},
    IssueStatus.triaged.value: {IssueStatus.in_progress.value},
    IssueStatus.in_progress.value: {IssueStatus.ready_for_validation.value},
    IssueStatus.ready_for_validation.value: {IssueStatus.closed.value, IssueStatus.in_progress.value},
    IssueStatus.closed.value: set(),
}
REMEDIATION_TRANSITIONS: dict[str, set[str]] = {
    IssueRemediationStatus.draft.value: {IssueRemediationStatus.active.value, IssueRemediationStatus.blocked.value},
    IssueRemediationStatus.active.value: {
        IssueRemediationStatus.blocked.value,
        IssueRemediationStatus.completed.value,
    },
    IssueRemediationStatus.blocked.value: {
        IssueRemediationStatus.active.value,
        IssueRemediationStatus.completed.value,
    },
    IssueRemediationStatus.completed.value: set(),
}


def _ensure_issue_transition(current_status: str, next_status: str) -> None:
    if next_status == current_status:
        return
    allowed = ISSUE_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        _conflict(f"Invalid issue transition: {current_status} -> {next_status}")


def _ensure_remediation_transition(current_status: str, next_status: str) -> None:
    if next_status == current_status:
        return
    allowed = REMEDIATION_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        _conflict(f"Invalid remediation transition: {current_status} -> {next_status}")


def _get_or_init_remediation(issue: Issue) -> IssueRemediationPlan:
    remediation = issue.remediation_plan
    if remediation is None:
        remediation = IssueRemediationPlan(
            issue_id=issue.id,
            status=IssueRemediationStatus.draft.value,
            progress_percent=0,
        )
        issue.remediation_plan = remediation
    return remediation
