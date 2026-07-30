"""Pydantic schemas for approval request API endpoints."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.core.datetime_utils import UtcAwareDatetime


class ApprovalStatusEnum(str, Enum):
    """Approval request status values."""

    pending = "pending"
    pending_privileged = "pending_privileged"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"
    expired = "expired"


class ApprovalResourceTypeEnum(str, Enum):
    """Type of resource being requested for deletion/edit."""

    risk = "risk"
    control = "control"
    kri = "kri"
    process = "process"
    asset = "asset"
    vendor = "vendor"


class ApprovalActionTypeEnum(str, Enum):
    """Type of action requiring approval."""

    delete = "delete"
    edit = "edit"
    create = "create"


class ApprovalQueuedResponse(BaseModel):
    """Normalized response for mutations queued for approval."""

    status: str = "approval_required"
    message: str
    approval_id: int
    action_type: ApprovalActionTypeEnum
    pending_fields: list[str] = Field(default_factory=list)
    pending_changes: dict[str, Any] | None = None
    primary_approver_id: int | None = None
    requires_privileged_approval: bool = False
    proposal_id: str | None = None
    proposal_version: int | None = None


class GovernedMutationApprovalRead(BaseModel):
    proposal_id: str
    proposal_version: int
    mutation_kind: str
    before: dict[str, Any]
    after: dict[str, Any]
    derived_impact: dict[str, Any]
    impacted_resources: list[dict[str, Any]]
    relationship_change: dict[str, Any] | None = None


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


class ApprovalRequestCapabilities(BaseModel):
    """Backend-authoritative approval row action capabilities."""

    can_read: bool
    can_approve: bool
    can_reject: bool
    can_cancel: bool
    can_cancel_as_requester: bool
    can_cancel_as_resolver: bool
    can_view_pending_changes: bool
    can_view_resolution_notes: bool
    can_inspect_side_effects: bool
    is_requester: bool
    is_primary_approver: bool
    is_privileged_resolver: bool
    is_pending: bool
    requires_privileged_resolution: bool
    would_apply_side_effects_on_approve: bool


class ApprovalRequestRead(BaseModel):
    """Schema for reading approval request details."""

    id: int
    resource_type: ApprovalResourceTypeEnum
    resource_id: int | None
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
    resolved_at: UtcAwareDatetime | None = None
    resolution_notes: str | None = None

    created_at: UtcAwareDatetime
    can_approve: bool
    can_reject: bool
    capabilities: ApprovalRequestCapabilities | None = None
    governed_mutation: GovernedMutationApprovalRead | None = None

    model_config = {"from_attributes": True}


class ApprovalRequestListResponse(BaseModel):
    """Paginated response for approval requests."""

    items: list[ApprovalRequestRead]
    total: int
    skip: int
    limit: int
    skipped_corrupt_payloads: int = 0
