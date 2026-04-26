from dataclasses import dataclass
from datetime import datetime

from app.core.datetime_utils import coerce_utc
from app.models import Issue, IssueSeverity
from app.models.notification import NotificationType


@dataclass(frozen=True)
class IssueDeadlineNotificationPlan:
    notification_type: NotificationType
    title: str
    message: str


def should_send_issue_due_soon(
    *,
    now: datetime,
    due_at: datetime,
    due_soon_cutoff: datetime,
    due_soon_backoff: datetime,
    last_due_soon_notified_at,
) -> bool:
    if not now <= due_at <= due_soon_cutoff:
        return False
    last_notified = coerce_utc(last_due_soon_notified_at)
    return last_notified is None or last_notified < due_soon_backoff


def should_send_issue_overdue(
    *,
    now: datetime,
    due_at: datetime,
    overdue_cutoff: datetime,
    last_overdue_notified_at,
) -> bool:
    if due_at >= now:
        return False
    last_notified = coerce_utc(last_overdue_notified_at)
    return last_notified is None or last_notified < overdue_cutoff


def should_escalate_issue_overdue(
    *,
    now: datetime,
    due_at: datetime,
    escalation_cutoff: datetime,
    last_escalated_at,
    issue_severity: IssueSeverity | str,
) -> bool:
    if due_at >= now:
        return False
    severity_value = issue_severity.value if isinstance(issue_severity, IssueSeverity) else issue_severity
    if severity_value not in {"high", "critical"}:
        return False
    last_escalated = coerce_utc(last_escalated_at)
    return last_escalated is None or last_escalated < escalation_cutoff


def build_issue_due_soon_notification_plan(*, issue: Issue, due_at: datetime) -> IssueDeadlineNotificationPlan:
    return IssueDeadlineNotificationPlan(
        notification_type=NotificationType.ISSUE_DUE_SOON,
        title=f"Issue due soon: {issue.title}",
        message=f"Issue '{issue.title}' is due on {due_at.date().isoformat()}.",
    )


def build_issue_overdue_notification_plan(*, issue: Issue, due_at: datetime) -> IssueDeadlineNotificationPlan:
    return IssueDeadlineNotificationPlan(
        notification_type=NotificationType.ISSUE_OVERDUE,
        title=f"Issue overdue: {issue.title}",
        message=f"Issue '{issue.title}' is overdue since {due_at.date().isoformat()}.",
    )


def build_issue_escalation_notification_plan(*, issue: Issue, due_at: datetime) -> IssueDeadlineNotificationPlan:
    return IssueDeadlineNotificationPlan(
        notification_type=NotificationType.ISSUE_OVERDUE,
        title=f"Escalated overdue issue: {issue.title}",
        message=f"High-severity issue '{issue.title}' remains overdue since {due_at.date().isoformat()}.",
    )
