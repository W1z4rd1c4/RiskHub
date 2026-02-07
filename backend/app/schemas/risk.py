from pydantic import BaseModel, Field, field_validator, computed_field
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from enum import Enum

if TYPE_CHECKING:
    from app.schemas.kri import KRIResponse
else:
    from app.schemas.kri import KRIResponse


class RiskTypeEnum(str, Enum):
    """Type of risk from OS 18."""
    strategic = "strategic"
    operational = "operational"


class RiskStatusEnum(str, Enum):
    """Status of the risk."""
    active = "active"
    emerging = "emerging"
    archived = "archived"


class ControlStatusEnum(str, Enum):
    """Status of the control."""
    draft = "draft"
    active = "active"
    inactive = "inactive"
    archived = "archived"


class ControlEffectivenessEnum(str, Enum):
    """How effectively a control mitigates a risk."""
    high = "high"
    medium = "medium"
    low = "low"


# ============== Risk Schemas ==============

class RiskBase(BaseModel):
    """Base schema for Risk based on OS 18 Registr rizik."""
    risk_id_code: Optional[str] = Field(None, max_length=50, description="Risk ID (auto-generated if not provided)")
    name: str = Field(..., max_length=255, description="Risk name (human-readable identifier)")
    process: str = Field(..., max_length=255, description="Main process")
    subprocess: Optional[str] = Field(None, max_length=255, description="Subprocess/area")
    risk_type: str = Field("operational", description="Risk type code (validated against risk_types config)")
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
    name: Optional[str] = Field(None, max_length=255)
    process: Optional[str] = Field(None, max_length=255)
    subprocess: Optional[str] = Field(None, max_length=255)
    risk_type: Optional[str] = None
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
    kris: list["KRIResponse"] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class RiskSummary(BaseModel):
    """Minimal schema for risk list views."""
    id: int
    risk_id_code: str
    name: str
    process: str
    risk_type: str
    category: Optional[str] = None
    description: str
    gross_score: int
    gross_probability: int
    gross_impact: int
    net_score: int
    status: RiskStatusEnum
    is_priority: bool
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    kri_count: int = 0
    control_count: int = 0
    has_breach: bool = False
    
    model_config = {"from_attributes": True}


class RiskListResponse(BaseModel):
    """Paginated list of risks."""
    items: list[RiskSummary]
    total: int
    skip: int
    limit: int


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
    status: ControlStatusEnum
    
    model_config = {"from_attributes": True}


class RiskBriefForLink(BaseModel):
    """Brief risk info for link display."""
    id: int
    risk_id_code: str
    name: str
    process: str
    description: str  # Used by ControlDetailPage and ExistingLinksPanel
    gross_score: int
    net_score: int
    status: Optional[RiskStatusEnum] = None
    
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
