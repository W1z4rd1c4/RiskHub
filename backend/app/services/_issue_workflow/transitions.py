from __future__ import annotations

from datetime import datetime

from app.core.exceptions import ConflictError
from app.models import Issue, IssueRemediationPlan
from app.models.issue import IssueRemediationStatus, IssueStatus


def _conflict(detail: str) -> None:
    raise ConflictError(detail)


def _status_value(value: object) -> str:
    raw_value = getattr(value, "value", value)
    return str(raw_value)


def _is_remediation_complete(remediation: IssueRemediationPlan | None) -> bool:
    if remediation is None:
        return False
    return (
        _status_value(remediation.status) == IssueRemediationStatus.completed.value
        and int(remediation.progress_percent or 0) >= 100
    )


def _completion_updates(remediation: IssueRemediationPlan, now: datetime) -> dict[str, object]:
    updates: dict[str, object] = {}
    if _status_value(remediation.status) != IssueRemediationStatus.completed.value:
        updates["status"] = IssueRemediationStatus.completed.value
    if int(remediation.progress_percent or 0) < 100:
        updates["progress_percent"] = 100
    if remediation.completed_at is None:
        updates["completed_at"] = now
    return updates


def _normalized_note(value: str) -> str | None:
    """A provided empty/whitespace note clears the field; text is kept trimmed."""
    return value.strip() or None


def _ensure_issue_not_closed(issue: Issue, action_label: str) -> None:
    if _status_value(issue.status) == IssueStatus.closed.value:
        _conflict(f"Cannot {action_label} a closed issue")


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
    current_status = _status_value(current_status)
    next_status = _status_value(next_status)
    if next_status == current_status:
        return
    allowed = ISSUE_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        _conflict(f"Invalid issue transition: {current_status} -> {next_status}")


def _ensure_remediation_transition(current_status: str, next_status: str) -> None:
    current_status = _status_value(current_status)
    next_status = _status_value(next_status)
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
