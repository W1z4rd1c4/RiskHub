"""Directory Sync schemas."""
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class DirectoryUserDiff(BaseModel):
    """Represents a proposed change to a user."""
    external_id: str
    email: Optional[str]
    user_principal_name: Optional[str]
    user_id: Optional[int] = None
    action: str  # create, update, deactivate, error
    changes: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class DirectorySyncPreview(BaseModel):
    """Summary of proposed sync changes."""
    created_count: int
    updated_count: int
    deactivated_count: int
    error_count: int
    diffs: list[DirectoryUserDiff]


class DirectorySyncLogRead(BaseModel):
    """Schema for sync log history."""
    id: int
    started_at: datetime
    finished_at: Optional[datetime]
    status: str
    created_count: int
    updated_count: int
    deactivated_count: int
    error_count: int
    errors: Optional[list[dict]] = None
    
    model_config = ConfigDict(from_attributes=True)


# Webhook schemas for receiving push notifications from AD Emulator
class WebhookUserData(BaseModel):
    """User data from AD Emulator webhook."""
    external_id: str
    email: Optional[str] = None
    display_name: str
    department: Optional[str] = None
    job_title: Optional[str] = None
    manager_external_id: Optional[str] = None
    account_enabled: bool = True
    
    model_config = ConfigDict(extra="ignore")


class WebhookPayload(BaseModel):
    """Payload received from AD Emulator webhooks."""
    event_type: str  # "user.created", "user.updated", "user.deactivated", "user.activated"
    timestamp: datetime
    data: WebhookUserData


class WebhookResponse(BaseModel):
    """Response returned to AD Emulator after processing webhook."""
    status: str  # "processed" or "failed"
    action: Optional[str] = None  # What action was taken
    orphaned_count: int = 0
    error: Optional[str] = None

