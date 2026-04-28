from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ExecutionResultEnum(str, Enum):
    """Canonical result of a control execution."""

    passed = "passed"
    failed = "failed"
    warning = "warning"
    not_applicable = "not_applicable"


class UserBriefForExecution(BaseModel):
    """Brief user info for execution relationships."""

    id: int
    name: str
    email: Optional[str] = None

    model_config = {"from_attributes": True}


class ControlBriefForExecution(BaseModel):
    """Brief control info for execution relationships."""

    id: int
    name: str

    model_config = {"from_attributes": True}


class ControlExecutionWriteBase(BaseModel):
    """Base payload for logging a control execution."""

    result: ExecutionResultEnum = Field(ExecutionResultEnum.passed)
    findings: Optional[str] = None
    evidence_reference: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
    next_scheduled: Optional[datetime] = None


class ControlExecutionCreate(ControlExecutionWriteBase):
    """Schema for logging a control execution via /controls/{id}/executions."""


class ControlExecutionCreateRequest(ControlExecutionWriteBase):
    """Schema for logging a control execution via the generic /executions endpoint."""

    control_id: int


class ControlExecutionRead(BaseModel):
    """Schema for reading control-scoped execution history."""

    id: int
    control_id: int
    executed_by_id: int
    executed_by: Optional[UserBriefForExecution] = None
    executed_at: datetime
    result: ExecutionResultEnum
    findings: Optional[str] = None
    evidence_reference: Optional[str] = None
    notes: Optional[str] = None
    next_scheduled: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ControlExecution(ControlExecutionRead):
    """Schema for generic execution list/detail responses with related display fields."""

    control: Optional[ControlBriefForExecution] = None
    executed_by_name: Optional[str] = None
    control_name: Optional[str] = None
    control_owner_name: Optional[str] = None
    linked_risks: Optional[list[str]] = None

    model_config = {"from_attributes": True}


class ControlExecutionListCapabilities(BaseModel):
    """Collection-level capabilities for the generic execution list."""

    can_export_csv: bool = False


class ControlExecutionListResponse(BaseModel):
    """Paginated generic execution list response."""

    items: list[ControlExecution]
    total: int
    skip: int
    limit: int
    capabilities: Optional[ControlExecutionListCapabilities] = None
