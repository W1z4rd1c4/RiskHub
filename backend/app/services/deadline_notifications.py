"""Compatibility imports for deadline-driven notification mechanics."""

from __future__ import annotations

from app.services._deadline_execution import (
    DeadlineNotificationExecutionPlan,
    VisibilityCheck,
    create_deadline_notification,
    execute_deadline_notification_plan,
    has_recent_deadline_notification,
    increment_deadline_results,
)

__all__ = [
    "DeadlineNotificationExecutionPlan",
    "VisibilityCheck",
    "create_deadline_notification",
    "execute_deadline_notification_plan",
    "has_recent_deadline_notification",
    "increment_deadline_results",
]
