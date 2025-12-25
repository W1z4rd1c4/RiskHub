from pydantic import BaseModel, Field, field_validator, computed_field
from datetime import datetime
from typing import Optional
from enum import Enum


class RiskTypeEnum(str, Enum):
    """Type of risk from OS 18."""
    strategic = "strategic"
    operational = "operational"


class RiskStatusEnum(str, Enum):
    """Status of the risk."""
    active = "active"
    monitoring = "monitoring"
    closed = "closed"
    archived = "archived"


class ControlEffectivenessEnum(str, Enum):
    """How effectively a control mitigates a risk."""
    high = "high"
    medium = "medium"
    low = "low"


# ============== Risk Schemas ==============

class RiskBase(BaseModel):
    """Base schema for Risk based on OS 18 Registr rizik."""
    risk_id_code: str = Field(..., max_length=50, description="Risk ID (e.g., Mkt-R01)")
    process: str = Field(..., max_length=255, description="Main process")
    subprocess: Optional[str] = Field(None, max_length=255, description="Subprocess/area")
    risk_type: RiskTypeEnum = Field(RiskTypeEnum.operational, description="Strategic/Operational")
    category: Optional[str] = Field(None, max_length=100, description="Risk category")
    description: str = Field(..., description="Risk description")
    department_id: Optional[int] = Field(None, description="Owner department")
    owner_id: Optional[int] = Field(None, description="Risk owner")
    
    # Gross risk (before controls)
    gross_probability: int = Field(3, ge=1, le=5, description="Probability 1-5")
    gross_impact: int = Field(3, ge=1, le=5, description="Impact 1-5")
    
    # Net risk (after controls)
    net_probability: int = Field(2, ge=1, le=5, description="Net probability 1-5")
    net_impact: int = Field(2, ge=1, le=5, description="Net impact 1-5")
    
    # Metadata
    status: RiskStatusEnum = Field(RiskStatusEnum.active)
    is_priority: bool = Field(False, description="In Risk Catalog (high priority)")
    
    # KRI fields
    kri_indicator: Optional[str] = Field(None, max_length=500)
    kri_threshold_green: Optional[str] = Field(None, max_length=255)
    kri_threshold_yellow: Optional[str] = Field(None, max_length=255)
    kri_threshold_red: Optional[str] = Field(None, max_length=255)

    @field_validator('gross_probability', 'gross_impact', 'net_probability', 'net_impact')
    @classmethod
    def validate_score_range(cls, v):
        if v < 1 or v > 5:
            raise ValueError('Value must be between 1 and 5')
        return v


class RiskCreate(RiskBase):
    """Schema for creating a Risk."""
    pass


class RiskUpdate(BaseModel):
    """Schema for updating a Risk (all fields optional)."""
    risk_id_code: Optional[str] = Field(None, max_length=50)
    process: Optional[str] = Field(None, max_length=255)
    subprocess: Optional[str] = Field(None, max_length=255)
    risk_type: Optional[RiskTypeEnum] = None
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    department_id: Optional[int] = None
    owner_id: Optional[int] = None
    gross_probability: Optional[int] = Field(None, ge=1, le=5)
    gross_impact: Optional[int] = Field(None, ge=1, le=5)
    net_probability: Optional[int] = Field(None, ge=1, le=5)
    net_impact: Optional[int] = Field(None, ge=1, le=5)
    status: Optional[RiskStatusEnum] = None
    is_priority: Optional[bool] = None
    kri_indicator: Optional[str] = Field(None, max_length=500)
    kri_threshold_green: Optional[str] = Field(None, max_length=255)
    kri_threshold_yellow: Optional[str] = Field(None, max_length=255)
    kri_threshold_red: Optional[str] = Field(None, max_length=255)


class UserBriefForRisk(BaseModel):
    """Brief user info for risk relationships."""
    id: int
    name: str
    email: str
    
    model_config = {"from_attributes": True}


class DepartmentBriefForRisk(BaseModel):
    """Brief department info for risk relationships."""
    id: int
    name: str
    code: str
    
    model_config = {"from_attributes": True}


class RiskRead(RiskBase):
    """Schema for reading a Risk with relationships and computed scores."""
    id: int
    gross_score: int  # Computed: gross_probability × gross_impact
    net_score: int    # Computed: net_probability × net_impact
    owner: Optional[UserBriefForRisk] = None
    department: Optional[DepartmentBriefForRisk] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class RiskSummary(BaseModel):
    """Minimal schema for risk list views."""
    id: int
    risk_id_code: str
    process: str
    risk_type: RiskTypeEnum
    category: Optional[str] = None
    gross_score: int
    net_score: int
    status: RiskStatusEnum
    is_priority: bool
    department_id: Optional[int] = None
    
    model_config = {"from_attributes": True}


# ============== Control-Risk Link Schemas ==============

class ControlRiskLinkCreate(BaseModel):
    """Schema for linking a control to a risk."""
    risk_id: int
    effectiveness: ControlEffectivenessEnum = Field(ControlEffectivenessEnum.medium)
    notes: Optional[str] = None


class ControlRiskLinkFromRisk(BaseModel):
    """Schema for linking from risk perspective."""
    control_id: int
    effectiveness: ControlEffectivenessEnum = Field(ControlEffectivenessEnum.medium)
    notes: Optional[str] = None


class ControlBriefForLink(BaseModel):
    """Brief control info for link display."""
    id: int
    name: str
    frequency: str
    risk_level: int
    
    model_config = {"from_attributes": True}


class RiskBriefForLink(BaseModel):
    """Brief risk info for link display."""
    id: int
    risk_id_code: str
    process: str
    gross_score: int
    net_score: int
    
    model_config = {"from_attributes": True}


class ControlRiskLinkRead(BaseModel):
    """Schema for reading a control-risk link."""
    id: int
    control_id: int
    risk_id: int
    effectiveness: ControlEffectivenessEnum
    notes: Optional[str] = None
    control: Optional[ControlBriefForLink] = None
    risk: Optional[RiskBriefForLink] = None
    created_at: datetime
    
    model_config = {"from_attributes": True}
