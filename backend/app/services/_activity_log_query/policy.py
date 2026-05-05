from __future__ import annotations

from app.core.permissions import get_user_department_ids, has_permission
from app.models import User
from app.schemas.activity_log import ActivityLogCapabilities


def activity_log_capabilities(current_user: User) -> ActivityLogCapabilities:
    return ActivityLogCapabilities(
        can_read=True,
        can_filter_by_department=get_user_department_ids(current_user) is None,
        can_view_entity_filters=True,
        can_export_csv=has_permission(current_user, "reports", "read"),
    )


def activity_log_department_scope(current_user: User) -> list[int] | None:
    return get_user_department_ids(current_user)
