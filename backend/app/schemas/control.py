from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional
from enum import Enum


class ControlFormEnum(str, Enum):
    """Form of control execution."""
    manual = "manual"
    automatic = "automatic"


class ControlFrequencyEnum(str, Enum):
    """Frequency of control execution."""
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"
    ad_hoc = "ad_hoc"


class ControlStatusEnum(str, Enum):
    """Status of the control."""
    draft = "draft"
    active = "active"
    inactive = "inactive"
    archived = "archived"


class ExecutionResultEnum(str, Enum):
    """Result of a control execution."""
    passed = "passed"
    failed = "failed"
    warning = "warning"
    not_applicable = "not_applicable"


# ============== Control Schemas ==============

class ControlBase(BaseModel):
    """Base schema for Control with all 13 fields from DEFINICIA KONTROL."""
    name: str = Field(..., max_length=255, description="Názov kontroly")
    description: str = Field(..., description="Stručný popis kontroly")
    data_source: Optional[str] = Field(None, max_length=500, description="Zdroj dát/vstup")
    methodology_reference: Optional[str] = Field(None, max_length=500, description="Smernica/Metodický postup")
    control_form: ControlFormEnum = Field(ControlFormEnum.manual, description="Forma kontroly")
    process_owner_position: Optional[str] = Field(None, max_length=255, description="Pozícia za process")
    control_owner_id: Optional[int] = Field(None, description="Zodpovedná osoba za kontrolu")
    executor_position: Optional[str] = Field(None, max_length=255, description="Kto vykonáva kontrolu")
    frequency: ControlFrequencyEnum = Field(ControlFrequencyEnum.monthly, description="Frekvencia")
    risk_level: int = Field(3, ge=1, le=5, description="Významnosť 1-5, 5 je max")
    output_description: Optional[str] = Field(None, description="Výstup kontroly")
    report_recipient: Optional[str] = Field(None, max_length=500, description="Komu sa reportuje")
    documentation_location: Optional[str] = Field(None, max_length=500, description="Kam sa dokumentuje")
    department_id: Optional[int] = Field(None, description="Vlastník katalógu")
    status: ControlStatusEnum = Field(ControlStatusEnum.draft, description="Status kontroly")

    @field_validator('risk_level')
    @classmethod
    def validate_risk_level(cls, v):
        if v < 1 or v > 5:
            raise ValueError('Risk level must be between 1 and 5')
        return v


class ControlCreate(ControlBase):
    """Schema for creating a Control."""
    pass


class ControlUpdate(BaseModel):
    """Schema for updating a Control (all fields optional)."""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    data_source: Optional[str] = Field(None, max_length=500)
    methodology_reference: Optional[str] = Field(None, max_length=500)
    control_form: Optional[ControlFormEnum] = None
    process_owner_position: Optional[str] = Field(None, max_length=255)
    control_owner_id: Optional[int] = None
    executor_position: Optional[str] = Field(None, max_length=255)
    frequency: Optional[ControlFrequencyEnum] = None
    risk_level: Optional[int] = Field(None, ge=1, le=5)
    output_description: Optional[str] = None
    report_recipient: Optional[str] = Field(None, max_length=500)
    documentation_location: Optional[str] = Field(None, max_length=500)
    department_id: Optional[int] = None
    status: Optional[ControlStatusEnum] = None


class UserBriefForControl(BaseModel):
    """Brief user info for control relationships."""
    id: int
    name: str
    email: str
    
    model_config = {"from_attributes": True}


class DepartmentBriefForControl(BaseModel):
    """Brief department info for control relationships."""
    id: int
    name: str
    code: str
    
    model_config = {"from_attributes": True}


class ControlRead(ControlBase):
    """Schema for reading a Control with relationships."""
    id: int
    control_owner: Optional[UserBriefForControl] = None
    department: Optional[DepartmentBriefForControl] = None
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class ControlSummary(BaseModel):
    """Minimal schema for control list views."""
    id: int
    name: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    frequency: ControlFrequencyEnum
    risk_level: int
    status: ControlStatusEnum
    control_form: ControlFormEnum
    control_owner_name: Optional[str] = None
    risk_type: Optional[str] = None
    risk_id_code: Optional[str] = None
    risk_description: Optional[str] = None
    risk_name: Optional[str] = None
    risk_owner_name: Optional[str] = None
    risk_department_name: Optional[str] = None
    
    model_config = {"from_attributes": True}


class ControlListResponse(BaseModel):
    """Paginated list of controls."""
    items: list[ControlSummary]
    total: int
    skip: int
    limit: int


# ============== Control Execution Schemas ==============

class ControlExecutionCreate(BaseModel):
    """Schema for logging a control execution."""
    result: ExecutionResultEnum = Field(ExecutionResultEnum.passed)
    findings: Optional[str] = None
    evidence_reference: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None


class ControlExecutionRead(BaseModel):
    """Schema for reading control execution history."""
    id: int
    control_id: int
    executed_by_id: int
    executed_by: Optional[UserBriefForControl] = None
    executed_at: datetime
    result: ExecutionResultEnum
    findings: Optional[str] = None
    evidence_reference: Optional[str] = None
    notes: Optional[str] = None
    next_scheduled: Optional[datetime] = None
    created_at: datetime
    
    model_config = {"from_attributes": True}
