"""Pydantic schemas for issue remediation management."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class IssueSeverityEnum(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IssueStatusEnum(str, Enum):
    open = "open"
    triaged = "triaged"
    in_progress = "in_progress"
    ready_for_validation = "ready_for_validation"
    closed = "closed"


class IssueSourceTypeEnum(str, Enum):
    manual = "manual"
    control_execution = "control_execution"
    kri_breach = "kri_breach"
    audit = "audit"


class IssueRemediationStatusEnum(str, Enum):
    draft = "draft"
    active = "active"
    blocked = "blocked"
    completed = "completed"


class IssueExceptionStatusEnum(str, Enum):
    requested = "requested"
    approved = "approved"
    revoked = "revoked"
    expired = "expired"


class IssueLinkBase(BaseModel):
    risk_id: int | None = None
    control_id: int | None = None
    execution_id: int | None = None
    kri_id: int | None = None

    @model_validator(mode="after")
    def validate_exactly_one_target(self):
        targets = [self.risk_id, self.control_id, self.execution_id, self.kri_id]
        non_null_count = sum(1 for item in targets if item is not None)
        if non_null_count != 1:
            raise ValueError("Exactly one linked target must be provided")
        return self


class IssueLinkCreate(IssueLinkBase):
    pass


class IssueLinkRead(IssueLinkBase):
    id: int
    issue_id: int
    linked_entity_type: str | None = None
    linked_entity_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class IssueRemediationPlanRead(BaseModel):
    id: int
    issue_id: int
    status: IssueRemediationStatusEnum
    progress_percent: int
    owner_user_id: int | None = None
    owner_user_name: str | None = None
    target_date: datetime | None = None
    blocker_reason: str | None = None
    completion_notes: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IssueExceptionRead(BaseModel):
    id: int
    issue_id: int
    status: IssueExceptionStatusEnum
    reason: str
    requested_by_id: int | None = None
    requested_by_name: str | None = None
    approved_by_id: int | None = None
    approved_by_name: str | None = None
    requested_at: datetime | None = None
    approved_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IssueSummary(BaseModel):
    id: int
    title: str
    severity: IssueSeverityEnum
    status: IssueStatusEnum
    source_type: IssueSourceTypeEnum
    source_id: int | None = None
    department_id: int
    department_name: str | None = None
    owner_user_id: int | None = None
    owner_user_name: str | None = None
    opened_at: datetime
    due_at: datetime | None = None
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IssueRead(IssueSummary):
    description: str | None = None
    created_by_id: int | None = None
    created_by_name: str | None = None
    validation_note: str | None = None
    links: list[IssueLinkRead] = Field(default_factory=list)
    remediation_plan: IssueRemediationPlanRead | None = None
    exceptions: list[IssueExceptionRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class IssueCreate(BaseModel):
    title: str = Field(..., max_length=255)
    description: str | None = None
    severity: IssueSeverityEnum = IssueSeverityEnum.medium
    source_type: IssueSourceTypeEnum = IssueSourceTypeEnum.manual
    source_id: int | None = None
    department_id: int | None = None
    owner_user_id: int | None = None
    due_at: datetime | None = None


class IssueUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    description: str | None = None
    severity: IssueSeverityEnum | None = None
    status: IssueStatusEnum | None = None
    source_type: IssueSourceTypeEnum | None = None
    source_id: int | None = None
    owner_user_id: int | None = None
    due_at: datetime | None = None
    department_id: int | None = None
    validation_note: str | None = None


class IssueListResponse(BaseModel):
    items: list[IssueSummary]
    total: int
    skip: int
    limit: int


class IssueAssignRequest(BaseModel):
    owner_user_id: int
    due_at: datetime
    target_date: datetime | None = None


class IssueStartRemediationRequest(BaseModel):
    target_date: datetime | None = None


class IssueProgressUpdateRequest(BaseModel):
    progress_percent: int | None = Field(None, ge=0, le=100)
    remediation_status: IssueRemediationStatusEnum | None = None
    blocker_reason: str | None = None
    completion_notes: str | None = None


class IssueExceptionRequestCreate(BaseModel):
    reason: str = Field(..., min_length=1)


class IssueExceptionApproveRequest(BaseModel):
    exception_id: int | None = None
    expires_at: datetime


class IssueExceptionRevokeRequest(BaseModel):
    exception_id: int | None = None


class IssueCloseRequest(BaseModel):
    validation_note: str = Field(..., min_length=1)
    completion_notes: str | None = None


class IssueDepartmentLookup(BaseModel):
    id: int
    name: str
    code: str


class IssueOwnerLookup(BaseModel):
    id: int
    name: str
    role_name: str | None = None
    department_name: str | None = None
