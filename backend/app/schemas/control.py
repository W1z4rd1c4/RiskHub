from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, computed_field, field_validator

from app.schemas.collection import CollectionGroupRead
from app.schemas.execution import ExecutionResultEnum
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_status import ControlMonitoringReason, ControlMonitoringStatus


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
    semi_annually = "semi-annually"
    annually = "annually"
    ad_hoc = "ad_hoc"
    continuous = "continuous"


def normalize_control_frequency(value: Any) -> ControlFrequencyEnum:
    """Normalize legacy frequency aliases to canonical ControlFrequencyEnum values."""
    if isinstance(value, ControlFrequencyEnum):
        return value
    if value is None:
        raise ValueError("Control frequency is required")

    raw_value = str(value).strip().lower()
    compact_value = raw_value.replace("_", "").replace("-", "").replace(" ", "")

    if compact_value in {"semiannual", "semiannually"}:
        canonical = ControlFrequencyEnum.semi_annually.value
    elif compact_value == "adhoc":
        canonical = ControlFrequencyEnum.ad_hoc.value
    else:
        canonical = raw_value.replace(" ", "_")

    try:
        return ControlFrequencyEnum(canonical)
    except ValueError as exc:
        allowed = ", ".join(item.value for item in ControlFrequencyEnum)
        raise ValueError(f"Invalid control frequency '{value}'. Allowed values: {allowed}") from exc


class ControlStatusEnum(str, Enum):
    """Status of the control."""

    draft = "draft"
    active = "active"
    inactive = "inactive"
    archived = "archived"


class ControlMonitoringBundle(BaseModel):
    """Canonical monitoring status data for controls."""

    monitoring_status: ControlMonitoringStatus
    monitoring_status_reason: ControlMonitoringReason
    latest_execution_result: Optional[ExecutionResultEnum] = None
    latest_executed_at: Optional[datetime] = None
    days_since_last_execution: Optional[int] = None
    execution_log_count: int = 0


class ControlCapabilities(BaseModel):
    """Backend-authoritative control detail/list action capabilities."""

    can_log_execution: bool
    can_link_risk: bool
    can_unlink_risk: bool


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

    @field_validator("risk_level")
    @classmethod
    def validate_risk_level(cls, v):
        if v < 1 or v > 5:
            raise ValueError("Risk level must be between 1 and 5")
        return v

    @field_validator("frequency", mode="before")
    @classmethod
    def validate_frequency(cls, v):
        return normalize_control_frequency(v)


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

    @field_validator("frequency", mode="before")
    @classmethod
    def validate_frequency(cls, v):
        if v is None:
            return None
        return normalize_control_frequency(v)


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


class ControlRead(ControlBase, ControlMonitoringBundle):
    """Schema for reading a Control with relationships."""

    id: int
    control_owner: Optional[UserBriefForControl] = None
    department: Optional[DepartmentBriefForControl] = None
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    capabilities: ControlCapabilities | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ControlSummary(ControlMonitoringBundle):
    """Minimal schema for control list views."""

    id: int
    name: str
    description: Optional[str] = None
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
    linked_vendors: list[LinkedVendorRead] = Field(default_factory=list)
    capabilities: ControlCapabilities | None = None

    model_config = {"from_attributes": True}

    @field_validator("frequency", mode="before")
    @classmethod
    def validate_frequency(cls, v):
        return normalize_control_frequency(v)


class ControlListResponse(BaseModel):
    """Paginated list of controls."""

    items: list[ControlSummary]
    total: int
    offset: int
    limit: int
    groups: list[CollectionGroupRead] | None = None

    @computed_field
    def skip(self) -> int:
        return self.offset
