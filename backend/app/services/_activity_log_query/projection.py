from __future__ import annotations

from app.models import ActivityLog, User
from app.schemas.activity_log import ActivityLogListResponse, ActivityLogRead

from .policy import activity_log_capabilities


def build_activity_log_response(
    *,
    entries: list[ActivityLog],
    total: int,
    skip: int,
    limit: int,
    current_user: User,
) -> ActivityLogListResponse:
    return ActivityLogListResponse(
        items=[ActivityLogRead.model_validate(entry) for entry in entries],
        total=total,
        skip=skip,
        limit=limit,
        capabilities=activity_log_capabilities(current_user),
    )


def build_empty_activity_log_response(
    *,
    skip: int,
    limit: int,
    current_user: User,
) -> ActivityLogListResponse:
    return build_activity_log_response(
        entries=[],
        total=0,
        skip=skip,
        limit=limit,
        current_user=current_user,
    )
