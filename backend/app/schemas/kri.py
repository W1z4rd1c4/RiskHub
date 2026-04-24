"""
Pydantic schemas for Key Risk Indicators.
"""

from datetime import date, datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, computed_field

from app.schemas.collection import CollectionGroupRead
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_status import KRIMonitoringReason, KRIMonitoringStatus


class KRIFrequencyEnum(str, Enum):
    """Frequency of KRI value reporting."""

    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"


class KRIBase(BaseModel):
    """Base schema for KRI."""

    metric_name: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., description="KRI description")
    current_value: float
    lower_limit: float
    upper_limit: float
    unit: str = Field(default="%", max_length=50)
    frequency: KRIFrequencyEnum = Field(default=KRIFrequencyEnum.quarterly)
    reporting_owner_id: Optional[int] = None


class KRICreate(KRIBase):
    """Schema for creating a KRI."""

    risk_id: int
    linked_vendor_ids: list[int] = Field(default_factory=list)
    ensure_parent_risk_vendor_ids: list[int] = Field(default_factory=list)


class KRIUpdate(BaseModel):
    """Schema for updating a KRI."""

    metric_name: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, description="KRI description")
    current_value: Optional[float] = None
    lower_limit: Optional[float] = None
    upper_limit: Optional[float] = None
    unit: Optional[str] = Field(None, max_length=50)
    frequency: Optional[KRIFrequencyEnum] = None
    reporting_owner_id: Optional[int] = None
    linked_vendor_ids: Optional[list[int]] = None


class KRIMonitoringBundle(BaseModel):
    """Canonical monitoring status data for KRIs."""

    monitoring_status: KRIMonitoringStatus
    monitoring_status_reason: KRIMonitoringReason
    is_submitted_for_required_period: bool
    required_period_end: date
    required_due_date: date
    days_overdue: int
    warning_upper_margin_ratio: float


class KRIResponse(KRIBase, KRIMonitoringBundle):
    """Schema for KRI response with computed breach status."""

    id: int
    risk_id: int
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    archived_by_id: Optional[int] = None

    # Description is inherited from KRIBase, explicitly included in response

    # Optional metadata for grouping
    risk_category: Optional[str] = None
    risk_process: Optional[str] = None
    risk_description: Optional[str] = None
    risk_name: Optional[str] = None
    risk_type: Optional[str] = None
    risk_id_code: Optional[str] = None
    risk_owner_name: Optional[str] = None
    risk_department_name: Optional[str] = None
    department_name: Optional[str] = None

    # Reporting ownership display
    reporting_owner_name: Optional[str] = None
    linked_vendors: list[LinkedVendorRead] = Field(default_factory=list)

    # Period tracking
    last_period_end: Optional[date] = None
    last_reported_at: Optional[datetime] = None

    last_updated: datetime
    created_at: datetime

    @computed_field
    @property
    def breach_status(self) -> Literal["above", "below", "within"]:
        """Compute breach status based on value vs limits."""
        if self.current_value < self.lower_limit:
            return "below"
        elif self.current_value > self.upper_limit:
            return "above"
        return "within"

    model_config = {"from_attributes": True}


class KRIListResponse(BaseModel):
    """Paginated list of KRIs."""

    items: list[KRIResponse]
    total: int
    offset: int
    limit: int
    groups: list[CollectionGroupRead] | None = None

    @computed_field
    @property
    def page(self) -> int:
        if self.limit <= 0:
            return 1
        return (self.offset // self.limit) + 1

    @computed_field
    @property
    def size(self) -> int:
        return self.limit


# History-related schemas


class KRIHistoryEntry(BaseModel):
    """Schema for a single KRI value history entry."""

    id: int
    kri_id: int
    period_start: date
    period_end: date
    recorded_at: datetime
    value: float
    lower_limit: float
    upper_limit: float
    unit: str
    breach_status: str
    recorded_by_id: Optional[int] = None
    recorded_by_name: Optional[str] = None

    model_config = {"from_attributes": True}


class KRIHistoryListResponse(BaseModel):
    """Paginated list of KRI history entries."""

    items: list[KRIHistoryEntry]
    total: int
    offset: int
    limit: int

    @computed_field
    @property
    def page(self) -> int:
        if self.limit <= 0:
            return 1
        return (self.offset // self.limit) + 1

    @computed_field
    @property
    def size(self) -> int:
        return self.limit


class KRIRecordValue(BaseModel):
    """Schema for recording a new KRI value."""

    value: float
    recorded_at: Optional[datetime] = None  # Server default if not provided
    period_end: Optional[date] = None  # For privileged backdating


class KRIHistoryEdit(BaseModel):
    """Schema for requesting correction to a historical entry."""

    value: float
    reason: str = Field(..., min_length=10, max_length=500, description="Explanation for the correction")
