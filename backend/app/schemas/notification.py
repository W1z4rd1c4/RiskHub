"""Pydantic schemas for notification API endpoints."""
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field


class NotificationTypeEnum(str, Enum):
    """Notification type values."""
    approval_pending = "approval_pending"
    approval_resolved = "approval_resolved"
    kri_due_soon = "kri_due_soon"
    kri_due_tomorrow = "kri_due_tomorrow"
    kri_overdue = "kri_overdue"
    kri_near_breach = "kri_near_breach"
    kri_breach_detected = "kri_breach_detected"


class NotificationBase(BaseModel):
    """Base shared fields for notifications."""
    title: str = Field(..., max_length=255)
    message: str
    resource_type: str | None = None
    resource_id: int | None = None


class NotificationCreate(NotificationBase):
    """Schema for creating a notification (internal use)."""
    user_id: int
    type: NotificationTypeEnum
    expires_at: datetime | None = None


class NotificationRead(NotificationBase):
    """Schema for reading notification details."""
    id: int
    type: NotificationTypeEnum
    is_read: bool
    created_at: datetime
    expires_at: datetime | None = None
    
    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    """Paginated response for notifications."""
    items: list[NotificationRead]
    total: int
    skip: int
    limit: int
    unread_count: int
