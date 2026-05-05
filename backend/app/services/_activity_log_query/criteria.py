from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.datetime_utils import coerce_utc


@dataclass(frozen=True)
class ActivityLogQueryCriteria:
    skip: int
    limit: int
    entity_type: list[str] | None
    entity_id: int | None
    actor_id: int | None
    department_id: int | None
    action: str | None
    search: str | None
    date_from: datetime | None
    date_to: datetime | None


def build_activity_log_query_criteria(
    *,
    skip: int,
    limit: int,
    entity_type: list[str] | None,
    entity_id: int | None,
    actor_id: int | None,
    department_id: int | None,
    action: str | None,
    search: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> ActivityLogQueryCriteria:
    return ActivityLogQueryCriteria(
        skip=skip,
        limit=limit,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
        department_id=department_id,
        action=action,
        search=search,
        date_from=coerce_utc(date_from),
        date_to=coerce_utc(date_to),
    )
