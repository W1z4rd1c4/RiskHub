"""Pydantic schemas for approval request API endpoints."""
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field


class ApprovalStatusEnum(str, Enum):
    """Approval request status values."""
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class ApprovalResourceTypeEnum(str, Enum):
    """Type of resource being requested for deletion."""
    risk = "risk"
    control = "control"
    kri = "kri"


class ApprovalRequestCreate(BaseModel):
    """Schema for creating a new approval request."""
    resource_type: ApprovalResourceTypeEnum
    resource_id: int
    reason: str = Field(..., min_length=1, max_length=1000, description="Reason for deletion (mandatory)")


class ApprovalRequestResolve(BaseModel):
    """Schema for resolving (approve/reject) a request."""
    resolution_notes: str = Field(..., min_length=1, max_length=1000, description="Commentary (mandatory)")


class ApprovalRequestRead(BaseModel):
    """Schema for reading approval request details."""
    id: int
    resource_type: ApprovalResourceTypeEnum
    resource_id: int
    resource_name: str
    status: ApprovalStatusEnum
    reason: str
    
    requested_by_id: int
    requested_by_name: str | None = None
    requested_by_email: str | None = None
    
    resolved_by_id: int | None = None
    resolved_by_name: str | None = None
    resolved_at: datetime | None = None
    resolution_notes: str | None = None
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class ApprovalRequestListResponse(BaseModel):
    """Paginated response for approval requests."""
    items: list[ApprovalRequestRead]
    total: int
    skip: int
    limit: int
