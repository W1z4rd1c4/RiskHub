from dataclasses import dataclass
from datetime import date, timedelta

from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.notification import NotificationType


@dataclass(frozen=True)
class KriDeadlineNotificationPlan:
    notification_type: NotificationType
    title: str
    message: str
    result_bucket: str | None
    message_contains: str


def build_kri_reporting_notification_plan(
    *,
    kri: KeyRiskIndicator,
    period_end: date,
    due: date,
    today: date,
    config: dict,
) -> KriDeadlineNotificationPlan | None:
    advance_date = period_end - timedelta(days=config["advance_reminder_days"])

    if today == advance_date:
        return KriDeadlineNotificationPlan(
            notification_type=NotificationType.KRI_DUE_SOON,
            title=f"KRI Reporting Due Soon: {kri.metric_name[:50]}",
            message=(
                f"KRI '{kri.metric_name}' reporting period ends on {period_end.isoformat()}. "
                "Please submit your value within "
                f"{config['reporting_grace_days']} days after that."
            ),
            result_bucket="due_soon",
            message_contains=period_end.isoformat(),
        )

    if today == due:
        return KriDeadlineNotificationPlan(
            notification_type=NotificationType.KRI_DUE_TOMORROW,
            title=f"KRI Reporting Deadline: {kri.metric_name[:50]}",
            message=(
                "Today is the deadline for reporting "
                f"KRI '{kri.metric_name}' for period ending {period_end.isoformat()}. "
                "Please submit your value now."
            ),
            result_bucket="deadline",
            message_contains=period_end.isoformat(),
        )

    if today <= due:
        return None

    days_overdue = (today - due).days
    overdue_weeks = days_overdue // 7
    if overdue_weeks <= 0 or overdue_weeks % config["overdue_reminder_weeks"] != 0:
        return None

    return KriDeadlineNotificationPlan(
        notification_type=NotificationType.KRI_OVERDUE,
        title=f"KRI Overdue ({days_overdue}d): {kri.metric_name[:50]}",
        message=(
            f"KRI '{kri.metric_name}' is {days_overdue} days overdue for reporting. "
            f"Period ended {period_end.isoformat()}, due date was {due.isoformat()}."
        ),
        result_bucket="overdue",
        message_contains=period_end.isoformat(),
    )


def build_kri_limit_notification_plan(
    *,
    kri: KeyRiskIndicator,
    config: dict,
) -> KriDeadlineNotificationPlan | None:
    breach_status = kri.breach_status

    if breach_status in ("above", "below"):
        return KriDeadlineNotificationPlan(
            notification_type=NotificationType.KRI_BREACH_DETECTED,
            title=f"KRI Breached: {kri.metric_name[:50]}",
            message=(
                f"KRI '{kri.metric_name}' is {breach_status} limit. "
                f"Current: {kri.current_value}, "
                f"Limits: [{kri.lower_limit}, {kri.upper_limit}]"
            ),
            result_bucket=None,
            message_contains=f"is {breach_status} limit",
        )

    range_size = kri.upper_limit - kri.lower_limit
    if range_size <= 0:
        return None

    threshold_value = kri.lower_limit + (range_size * config["near_breach_threshold"])
    if kri.current_value < threshold_value:
        return None

    return KriDeadlineNotificationPlan(
        notification_type=NotificationType.KRI_NEAR_BREACH,
        title=f"KRI Near Breach: {kri.metric_name[:50]}",
        message=(
            f"KRI '{kri.metric_name}' is approaching upper limit. "
            f"Current: {kri.current_value}, Upper limit: {kri.upper_limit}"
        ),
        result_bucket="near_breach",
        message_contains=f"Upper limit: {kri.upper_limit}",
    )
