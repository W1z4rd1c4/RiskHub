from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.deadline_notifications import (
    DeadlineNotificationExecutionPlan,
    VisibilityCheck,
    create_deadline_notification,
    execute_deadline_notification_plan,
    has_recent_deadline_notification,
    increment_deadline_results,
)
from app.services.deadline_runner import run_deadline_items

DeadlineNotificationPlan = DeadlineNotificationExecutionPlan


@dataclass(frozen=True)
class DeadlineRunPlan:
    items: list[Any]
    total_key: str | None = None
    item_label: str = "deadline item"


@dataclass(frozen=True)
class DeadlineRunOutcome:
    results: dict[str, int]
