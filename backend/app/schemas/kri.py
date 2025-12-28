"""
Pydantic schemas for Key Risk Indicators.
"""
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, computed_field


class KRIBase(BaseModel):
    """Base schema for KRI."""
    metric_name: str = Field(..., min_length=1, max_length=500)
    current_value: float
    lower_limit: float
    upper_limit: float
    unit: str = Field(default="%", max_length=50)


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


class KRIResponse(KRIBase):
    """Schema for KRI response with computed breach status."""
    id: int
    risk_id: int
    
    # Optional metadata for grouping
    risk_category: Optional[str] = None
    risk_process: Optional[str] = None
    risk_description: Optional[str] = None
    department_name: Optional[str] = None
    
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
