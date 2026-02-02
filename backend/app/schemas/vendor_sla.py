from __future__ import annotations

from enum import Enum
from datetime import datetime, date

from pydantic import BaseModel, Field


class VendorSLAFrequencyEnum(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"


class VendorSLARead(BaseModel):
    id: int
    vendor_id: int
    metric_name: str
    description: str
    current_value: float
    lower_limit: float
    upper_limit: float
    unit: str
    frequency: VendorSLAFrequencyEnum
    reporting_owner_id: int | None = None
    last_period_end: date | None = None
    last_reported_at: datetime
    is_archived: bool
    archived_at: datetime | None = None
    archived_by_id: int | None = None
    created_at: datetime
    last_updated: datetime
    breach_status: str

    model_config = {"from_attributes": True}


class VendorSLACreate(BaseModel):
    vendor_id: int
    metric_name: str = Field(..., max_length=500)
    description: str
    current_value: float
    lower_limit: float
    upper_limit: float
    unit: str = Field("%", max_length=50)
    frequency: VendorSLAFrequencyEnum = VendorSLAFrequencyEnum.monthly
    reporting_owner_id: int | None = None


class VendorSLAUpdate(BaseModel):
    metric_name: str | None = Field(None, max_length=500)
    description: str | None = None
    current_value: float | None = None
    lower_limit: float | None = None
    upper_limit: float | None = None
    unit: str | None = Field(None, max_length=50)
    frequency: VendorSLAFrequencyEnum | None = None
    reporting_owner_id: int | None = None


class VendorSLAArchive(BaseModel):
    reason: str | None = None


class VendorSLAValueCreate(BaseModel):
    value: float
    recorded_at: datetime | None = None


class VendorSLAHistoryEntry(BaseModel):
    id: int
    sla_id: int
    period_start: date
    period_end: date
    recorded_at: datetime
    recorded_by_id: int | None = None
    value: float
    lower_limit: float
    upper_limit: float
    unit: str
    breach_status: str

    model_config = {"from_attributes": True}


class VendorSLAHistoryResponse(BaseModel):
    sla_id: int
    items: list[VendorSLAHistoryEntry]

