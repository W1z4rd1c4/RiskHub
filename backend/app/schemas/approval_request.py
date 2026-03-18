"""Pydantic schemas for approval request API endpoints."""
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ApprovalStatusEnum(str, Enum):
    """Approval request status values."""
    pending = "pending"
    pending_privileged = "pending_privileged"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class ApprovalResourceTypeEnum(str, Enum):
    """Type of resource being requested for deletion/edit."""
    risk = "risk"
    control = "control"
    kri = "kri"


class ApprovalActionTypeEnum(str, Enum):
    """Type of action requiring approval."""
    delete = "delete"
    edit = "edit"


class ApprovalRequestCreate(BaseModel):
    """Schema for creating a new delete approval request."""
    resource_type: ApprovalResourceTypeEnum
    resource_id: int
    reason: str = Field(..., min_length=1, max_length=1000, description="Reason for deletion (mandatory)")


class ApprovalEditRequestCreate(BaseModel):
    """Schema for creating an edit approval request."""
    resource_type: ApprovalResourceTypeEnum
    resource_id: int
    reason: str = Field(..., min_length=1, max_length=1000, description="Reason for edit (mandatory)")
    pending_changes: dict[str, dict[str, Any]] = Field(..., description="Changes: {field: {old: v1, new: v2}}")


class ApprovalRequestResolve(BaseModel):
    """Schema for resolving (approve/reject) a request."""
    resolution_notes: str = Field(..., min_length=1, max_length=1000, description="Commentary (mandatory)")


class ApprovalRequestRead(BaseModel):
    """Schema for reading approval request details."""
    id: int
    resource_type: ApprovalResourceTypeEnum
    resource_id: int
    resource_name: str
    action_type: ApprovalActionTypeEnum = ApprovalActionTypeEnum.delete
    pending_changes: dict | None = None
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
    can_approve: bool
    can_reject: bool

    model_config = {"from_attributes": True}


class ApprovalRequestListResponse(BaseModel):
    """Paginated response for approval requests."""
    items: list[ApprovalRequestRead]
    total: int
    skip: int
    limit: int
