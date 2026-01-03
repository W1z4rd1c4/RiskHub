"""Webhook payload schemas for AD Emulator push notifications."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel

from app.schemas.directory_user import DirectoryUserRead


class WebhookPayload(BaseModel):
    """Payload sent to RiskHub when directory user changes occur."""
    event_type: Literal["user.created", "user.updated", "user.deactivated", "user.activated"]
    timestamp: datetime
    data: DirectoryUserRead
    
    class Config:
        json_schema_extra = {
            "example": {
                "event_type": "user.created",
                "timestamp": "2025-01-01T00:00:00Z",
                "data": {
                    "id": 1,
                    "external_id": "usr-001",
                    "email": "john.doe@example.com",
                    "display_name": "John Doe",
                    "department": "Operations",
                    "account_enabled": True
                }
            }
        }
