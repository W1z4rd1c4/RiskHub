from enum import Enum
from typing import TYPE_CHECKING, Optional

from pydantic import BaseModel, Field, computed_field, field_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.models.global_config import ConfigDefaults
from app.schemas.collection import CollectionGroupRead
from app.schemas.execution import ExecutionResultEnum
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_status import ControlMonitoringReason, ControlMonitoringStatus

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


class ControlStatusEnum(str, Enum):
    """Status of the control."""

    draft = "draft"
    active = "active"
    inactive = "inactive"


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

    @field_validator("gross_probability", "gross_impact", "net_probability", "net_impact")
    @classmethod
    def validate_score_range(cls, v):
        if v < 1 or v > 5:
            raise ValueError("Value must be between 1 and 5")
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


class RiskCapabilities(BaseModel):
    """Backend-authoritative risk detail/list action capabilities."""

    can_read: bool
    can_update: bool
    can_update_sensitive_fields: bool
    can_request_update_approval: bool
    can_archive_immediately: bool
    can_request_archive_approval: bool
    can_restore: bool
    can_send_questionnaire: bool
    can_create_kri: bool
    can_create_linked_control: bool
    can_link_controls: bool
    can_unlink_controls: bool
    can_view_linked_controls: bool
    can_view_linked_vendors: bool
    can_create_issue: bool
    has_pending_delete_approval: bool
    has_pending_update_approval: bool
    requires_privileged_update_approval: bool
    requires_privileged_delete_approval: bool


class RiskRead(RiskBase):
    """Schema for reading a Risk with relationships and computed scores."""

    id: int
    gross_score: int = Field(..., ge=1, le=ConfigDefaults.MAX_NET_SCORE)  # gross_probability × gross_impact
    net_score: int = Field(..., ge=1, le=ConfigDefaults.MAX_NET_SCORE)  # net_probability × net_impact
    is_archived: bool = False
    archived_at: Optional[UtcAwareDatetime] = None
    archived_by_id: Optional[int] = None
    owner: Optional[UserBriefForRisk] = None
    department: Optional[DepartmentBriefForRisk] = None
    kris: list["KRIResponse"] = Field(default_factory=list)
    capabilities: RiskCapabilities | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class RiskSummary(BaseModel):
    """Minimal schema for risk list views."""

    id: int
    risk_id_code: str
    name: str
    process: str
    subprocess: Optional[str] = None
    risk_type: str
    category: Optional[str] = None
    description: str
    gross_score: int = Field(..., ge=1, le=ConfigDefaults.MAX_NET_SCORE)
    gross_probability: int
    gross_impact: int
    net_score: int = Field(..., ge=1, le=ConfigDefaults.MAX_NET_SCORE)
    status: RiskStatusEnum
    is_archived: bool = False
    is_priority: bool
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    kri_count: int = 0
    control_count: int = 0
    has_breach: bool = False
    linked_vendors: list[LinkedVendorRead] = Field(default_factory=list)
    capabilities: RiskCapabilities | None = None

    model_config = {"from_attributes": True}


class RiskListResponse(BaseModel):
    """Paginated list of risks."""

    items: list[RiskSummary]
    total: int
    offset: int
    limit: int
    groups: list[CollectionGroupRead] | None = None
    capabilities: dict[str, bool] | None = None

    @computed_field
    def skip(self) -> int:
        return self.offset


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
    is_archived: bool
    monitoring_status: ControlMonitoringStatus
    monitoring_status_reason: ControlMonitoringReason
    latest_execution_result: Optional[ExecutionResultEnum] = None
    latest_executed_at: Optional[UtcAwareDatetime] = None
    days_since_last_execution: Optional[int] = None
    execution_log_count: int = 0

    model_config = {"from_attributes": True}


class RiskBriefForLink(BaseModel):
    """Brief risk info for link display."""

    id: int
    risk_id_code: str
    name: str
    process: str
    description: str  # Used by ControlDetailPage and ExistingLinksPanel
    gross_score: int = Field(..., ge=1, le=ConfigDefaults.MAX_NET_SCORE)
    net_score: int = Field(..., ge=1, le=ConfigDefaults.MAX_NET_SCORE)
    status: Optional[RiskStatusEnum] = None
    is_archived: bool

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
    created_at: UtcAwareDatetime

    model_config = {"from_attributes": True}
