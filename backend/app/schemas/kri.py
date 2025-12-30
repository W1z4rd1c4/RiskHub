"""
Pydantic schemas for Key Risk Indicators.
"""
from datetime import datetime, date
from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field, computed_field


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
    current_value: float
    lower_limit: float
    upper_limit: float
    unit: str = Field(default="%", max_length=50)
    frequency: KRIFrequencyEnum = Field(default=KRIFrequencyEnum.quarterly)
    reporting_owner_id: Optional[int] = None


class KRICreate(KRIBase):
    """Schema for creating a KRI."""
    risk_id: int


class KRIUpdate(BaseModel):
    """Schema for updating a KRI."""
    metric_name: Optional[str] = Field(None, min_length=1, max_length=500)
    current_value: Optional[float] = None
    lower_limit: Optional[float] = None
    upper_limit: Optional[float] = None
    unit: Optional[str] = Field(None, max_length=50)
    frequency: Optional[KRIFrequencyEnum] = None
    reporting_owner_id: Optional[int] = None


class KRIResponse(KRIBase):
    """Schema for KRI response with computed breach status."""
    id: int
    risk_id: int
    
    # Optional metadata for grouping
    risk_category: Optional[str] = None
    risk_process: Optional[str] = None
    risk_description: Optional[str] = None
    department_name: Optional[str] = None
    
    # Reporting ownership display
    reporting_owner_name: Optional[str] = None
    
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
    page: int
    size: int


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
    page: int
    size: int


class KRIRecordValue(BaseModel):
    """Schema for recording a new KRI value."""
    value: float
    recorded_at: Optional[datetime] = None  # Server default if not provided
    period_end: Optional[date] = None  # For privileged backdating


class KRIHistoryEdit(BaseModel):
    """Schema for requesting correction to a historical entry."""
    value: float
    reason: str = Field(..., min_length=10, max_length=500, description="Explanation for the correction")

