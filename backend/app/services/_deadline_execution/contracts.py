from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from app.models.notification import NotificationType

VisibilityCheck = Callable[[], Awaitable[bool]]


@dataclass(frozen=True)
class DeadlineNotificationPlan:
    user_id: int
    notification_type: NotificationType
    title: str
    message: str
    resource_type: str
    resource_id: int
    now: datetime
    lookback_days: int | None = None
    not_before: datetime | None = None
    message_contains: str | None = None
    visibility_check: VisibilityCheck | None = None
    result_bucket: str | None = None


DeadlineNotificationExecutionPlan = DeadlineNotificationPlan
