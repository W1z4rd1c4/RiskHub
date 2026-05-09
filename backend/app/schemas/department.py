from typing import Optional

from pydantic import BaseModel, Field

from app.core.datetime_utils import UtcAwareDatetime


class DepartmentBase(BaseModel):
    """Base schema for Department."""

    name: str = Field(..., max_length=255, description="Department name")
    code: str = Field(..., max_length=50, description="Department code")
    description: Optional[str] = Field(None, max_length=500, description="Department description")


class DepartmentRead(DepartmentBase):
    """Schema for reading a Department."""

    id: int
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class DepartmentSummary(BaseModel):
    """Minimal schema for department list views with counts."""

    id: int
    name: str
    code: str
    user_count: int
    risk_count: int
    control_count: int
    high_risk_count: int
    breaching_kri_count: int = 0
    kri_count: int = 0
    total_net_score: int = 0

    model_config = {"from_attributes": True}


class RiskDistribution(BaseModel):
    """Risk distribution by level."""

    low: int = 0
    medium: int = 0
    high: int = 0
    critical: int = 0


class ControlStats(BaseModel):
    """Control statistics."""

    total: int
    active: int
    inactive: int
    by_form: dict[str, int]
    by_frequency: dict[str, int]


class RecentExecution(BaseModel):
    """Recent control execution summary."""

    id: int
    control_id: int
    control_name: str
    result: str
    executed_at: UtcAwareDatetime
    executed_by: str

    model_config = {"from_attributes": True}


class DepartmentDetail(DepartmentBase):
    """Detailed schema for department detail view."""

    id: int
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    # Counts
    user_count: int
    risk_count: int
    high_risk_count: int
    control_count: int
    kri_count: int = 0
    kri_monitoring_counts: dict[str, int] = Field(default_factory=dict)

    # Risk metrics
    risk_distribution: RiskDistribution
    risk_by_status: dict[str, int]

    # Control metrics
    control_stats: ControlStats

    # Recent activity
    recent_executions: list[RecentExecution]

    model_config = {"from_attributes": True}
