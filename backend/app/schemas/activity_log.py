"""Schemas for Activity Log API."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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
    created_at: datetime
    
    model_config = {"from_attributes": True}


class ActivityLogListResponse(BaseModel):
    """Paginated activity log response."""
    items: list[ActivityLogRead]
    total: int
    skip: int
    limit: int
