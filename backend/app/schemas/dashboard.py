"""
Dashboard Schemas for Executive and Department-level Metrics
"""
from pydantic import BaseModel
from typing import Optional


class DashboardSummaryResponse(BaseModel):
    """Overview stats for executive dashboard."""
    total_controls: int = 0
    controls_by_status: dict[str, int] = {}
    controls_by_form: dict[str, int] = {}
    controls_by_frequency: dict[str, int] = {}
    total_risks: int = 0
    risks_by_status: dict[str, int] = {}
    critical_risks_count: int = 0  # net_score >= 15
    average_net_risk_score: float = 0.0

    # Vendor metrics (Phase 18-11) - additive fields
    total_vendors: int = 0
    high_risk_vendors_count: int = 0  # vendor.risk_score_1_5 >= 4
    overdue_vendor_reassessments_count: int = 0  # vendor.next_reassessment_due_at < now
    breached_vendor_slas_count: int = 0  # vendor SLA current_value outside limits

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
    distribution: list[RiskDistributionItem] = []

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
