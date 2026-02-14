from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class VendorIncidentTypeEnum(str, Enum):
    security = "security"
    operational = "operational"
    regulatory_breach = "regulatory_breach"
    contract_breach = "contract_breach"
    other = "other"


class VendorIncidentSeverityEnum(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class VendorIncidentRead(BaseModel):
    id: int
    vendor_id: int
    incident_type: VendorIncidentTypeEnum
    severity: VendorIncidentSeverityEnum
    is_major: bool
    occurred_at: datetime | None = None
    detected_at: datetime | None = None
    resolved_at: datetime | None = None
    summary: str
    details: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VendorIncidentCreate(BaseModel):
    incident_type: VendorIncidentTypeEnum
    severity: VendorIncidentSeverityEnum = VendorIncidentSeverityEnum.medium
    is_major: bool = False
    occurred_at: datetime | None = None
    detected_at: datetime | None = None
    resolved_at: datetime | None = None
    summary: str = Field(..., max_length=500)
    details: str | None = None


class VendorIncidentUpdate(BaseModel):
    incident_type: VendorIncidentTypeEnum | None = None
    severity: VendorIncidentSeverityEnum | None = None
    is_major: bool | None = None
    occurred_at: datetime | None = None
    detected_at: datetime | None = None
    resolved_at: datetime | None = None
    summary: str | None = Field(None, max_length=500)
    details: str | None = None


class VendorRemediationStatusEnum(str, Enum):
    open = "open"
    in_progress = "in_progress"
    done = "done"


class VendorRemediationRead(BaseModel):
    id: int
    vendor_id: int
    incident_id: int | None = None
    owner_user_id: int | None = None
    status: VendorRemediationStatusEnum
    due_at: datetime | None = None
    completed_at: datetime | None = None
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VendorRemediationCreate(BaseModel):
    incident_id: int | None = None
    owner_user_id: int | None = None
    status: VendorRemediationStatusEnum = VendorRemediationStatusEnum.open
    due_at: datetime | None = None
    description: str


class VendorRemediationUpdate(BaseModel):
    owner_user_id: int | None = None
    status: VendorRemediationStatusEnum | None = None
    due_at: datetime | None = None
    completed_at: datetime | None = None
    description: str | None = None

