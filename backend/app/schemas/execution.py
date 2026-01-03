from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.control_execution import ExecutionResult


class ControlExecutionBase(BaseModel):
    control_id: int
    executed_by_id: int
    result: str = ExecutionResult.passed.value
    findings: Optional[str] = None
    evidence_reference: Optional[str] = None
    notes: Optional[str] = None
    next_scheduled: Optional[datetime] = None


class ControlExecutionCreate(BaseModel):
    control_id: int
    result: str = ExecutionResult.passed.value
    findings: Optional[str] = None
    evidence_reference: Optional[str] = None
    notes: Optional[str] = None
    next_scheduled: Optional[datetime] = None


class ControlExecution(ControlExecutionBase):
    id: int
    executed_at: datetime
    created_at: datetime
    
    # Nested relations (simplified for list)
    executed_by_name: Optional[str] = None
    control_name: Optional[str] = None
    control_owner_name: Optional[str] = None
    linked_risks: Optional[list[str]] = None

    model_config = {"from_attributes": True}
