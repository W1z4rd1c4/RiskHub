"""Schemas for Activity Log API."""

from typing import Optional

from pydantic import BaseModel

from app.core.datetime_utils import UtcAwareDatetime


class ActivityLogRead(BaseModel):
    """Response schema for activity log entry."""

    id: int
    entity_type: str
    entity_id: int
    entity_name: str
    action: str
    actor_id: Optional[int] = None
    actor_name: str
    department_id: Optional[int] = None
    changes: Optional[dict] = None
    description: str
    created_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class ActivityLogCapabilities(BaseModel):
    """Backend-authoritative activity-log action capabilities."""

    can_read: bool = False
    can_filter_by_department: bool = False
    can_view_entity_filters: bool = False
    can_export_csv: bool = False


class ActivityLogListResponse(BaseModel):
    """Paginated activity log response."""

    items: list[ActivityLogRead]
    total: int
    skip: int
    limit: int
    capabilities: ActivityLogCapabilities | None = None
