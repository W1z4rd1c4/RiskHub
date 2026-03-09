"""
Dashboard Schemas for Executive and Department-level Metrics
"""

from pydantic import BaseModel, Field


class DashboardSummaryResponse(BaseModel):
    """Overview stats for executive dashboard."""
    total_controls: int = 0
    controls_by_status: dict[str, int] = Field(default_factory=dict)
    controls_by_form: dict[str, int] = Field(default_factory=dict)
    controls_by_frequency: dict[str, int] = Field(default_factory=dict)
    total_risks: int = 0
    risks_by_status: dict[str, int] = Field(default_factory=dict)
    critical_risks_count: int = 0  # net_score >= 15
    average_net_risk_score: float = 0.0

    total_vendors: int = 0
    high_risk_vendors_count: int = 0  # vendor.risk_score_1_5 >= 4

    model_config = {"from_attributes": True}


class DepartmentMetrics(BaseModel):
    """Per-department statistics."""
    department_id: int
    department_name: str
    control_count: int = 0
    risk_count: int = 0
    high_risk_count: int = 0  # risk_level >= 4
    audited_control_count: int = 0
    breaching_kri_count: int = 0
    total_kri_count: int = 0
    compliance_rate: float = 0.0  # active controls / total controls

    model_config = {"from_attributes": True}


class RiskDistributionItem(BaseModel):
    """Single cell in risk matrix."""
    probability: int
    impact: int
    count: int


class RiskDistributionResponse(BaseModel):
    """For heatmap/risk matrix visualization."""
    distribution: list[RiskDistributionItem] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ControlFrequencyTrend(BaseModel):
    """Time series for control execution charts."""
    period: str  # e.g., "2025-W24"
    execution_count: int = 0

    model_config = {"from_attributes": True}


class RiskTrendPoint(BaseModel):
    """Time series point for risk creation trends."""
    period: str  # e.g., "2025-01"
    total_new: int = 0
    critical_new: int = 0

    model_config = {"from_attributes": True}


class KRIBreachTrendPoint(BaseModel):
    """Time series point for KRI breach trends."""
    period: str  # e.g., "2025-01"
    total_entries: int = 0
    breached_entries: int = 0

    model_config = {"from_attributes": True}


class IssueDashboardSummaryResponse(BaseModel):
    """Overview counters for issue remediation dashboard widgets."""
    open_issues: int = 0
    overdue_issues: int = 0
    high_severity_open: int = 0
    median_days_open: int = 0


class IssueAgingBucket(BaseModel):
    """Issue aging bucket used for charting open issue age distribution."""
    bucket: str
    count: int = 0


class IssueAgingResponse(BaseModel):
    """Aging response for issue dashboard."""
    buckets: list[IssueAgingBucket] = Field(default_factory=list)


class IssueSeverityBreakdownItem(BaseModel):
    """Issue severity count entry used by severity charts."""
    severity: str
    count: int = 0


class IssueSeverityBreakdownResponse(BaseModel):
    """Issue severity breakdown payload."""
    items: list[IssueSeverityBreakdownItem] = Field(default_factory=list)


class DashboardOverviewResponse(BaseModel):
    """Aggregate dashboard payload for the main overview screen."""
    summary: DashboardSummaryResponse
    department_metrics: list[DepartmentMetrics] = Field(default_factory=list)
    gross_distribution: RiskDistributionResponse
    net_distribution: RiskDistributionResponse
    control_trends: list[ControlFrequencyTrend] = Field(default_factory=list)
    risk_trends: list[RiskTrendPoint] = Field(default_factory=list)
    kri_breach_trends: list[KRIBreachTrendPoint] = Field(default_factory=list)
    issue_summary: IssueDashboardSummaryResponse | None = None
    issue_aging: IssueAgingResponse | None = None
    issue_severity: IssueSeverityBreakdownResponse | None = None
    generated_at: str
