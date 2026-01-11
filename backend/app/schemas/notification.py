"""Pydantic schemas for notification API endpoints."""
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field


class NotificationTypeEnum(str, Enum):
    """Notification type values."""
    approval_pending = "approval_pending"
    approval_resolved = "approval_resolved"
    approval_cancelled = "approval_cancelled"
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


class NotificationPreferences(BaseModel):
    """User notification preference toggles per type."""
    approval_pending: bool = True
    approval_resolved: bool = True
    approval_cancelled: bool = True
    kri_due_soon: bool = True
    kri_due_tomorrow: bool = True
    kri_overdue: bool = True
    kri_near_breach: bool = True
    kri_breach_detected: bool = True
    
    model_config = {"from_attributes": True}


class NotificationPreferencesUpdate(BaseModel):
    """Partial update for notification preferences."""
    approval_pending: bool | None = None
    approval_resolved: bool | None = None
    approval_cancelled: bool | None = None
    kri_due_soon: bool | None = None
    kri_due_tomorrow: bool | None = None
    kri_overdue: bool | None = None
    kri_near_breach: bool | None = None
    kri_breach_detected: bool | None = None

