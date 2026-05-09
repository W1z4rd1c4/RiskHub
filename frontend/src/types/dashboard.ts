export interface DashboardSummary {
    total_controls: number;
    controls_by_status: Record<string, number>;
    controls_by_form: Record<string, number>;
    controls_by_frequency: Record<string, number>;
    total_risks: number;
    risks_by_status: Record<string, number>;
    critical_risks_count: number;
    average_net_risk_score: number;

    total_vendors?: number;
    high_risk_vendors_count?: number;
}

export interface DepartmentMetrics {
    department_id: number;
    department_name: string;
    control_count: number;
    risk_count: number;
    high_risk_count: number;
    audited_control_count: number;
    breaching_kri_count: number;
    total_kri_count: number;
    compliance_rate: number;
}

export interface RiskDistributionItem {
    probability: number;
    impact: number;
    count: number;
}

export interface RiskDistribution {
    distribution: RiskDistributionItem[];
}

export interface ControlTrend {
    period: string; // e.g., "2025-W24"
    execution_count: number;
}

export interface RiskTrendPoint {
    period: string; // e.g., "2025-01"
    total_new: number;
    critical_new: number;
}

export interface KRIBreachTrendPoint {
    period: string; // e.g., "2025-01"
    total_entries: number;
    breached_entries: number;
}

export interface IssueDashboardSummary {
    open_issues: number;
    overdue_issues: number;
    high_severity_open: number;
    median_days_open: number;
}

export interface IssueAgingBucket {
    bucket: string;
    count: number;
}

export interface IssueAgingResponse {
    buckets: IssueAgingBucket[];
}

export interface IssueSeverityBreakdownItem {
    severity: string;
    count: number;
}

export interface IssueSeverityBreakdownResponse {
    items: IssueSeverityBreakdownItem[];
}

export interface DashboardOverviewCapabilities {
    can_read: boolean;
    can_view_issue_metrics: boolean;
    can_view_committee: boolean;
    can_view_vendor_metrics: boolean;
    can_use_department_filter: boolean;
    can_export_or_report: boolean;
}

export interface DashboardOverview {
    summary: DashboardSummary;
    department_metrics: DepartmentMetrics[];
    gross_distribution: RiskDistribution;
    net_distribution: RiskDistribution;
    control_trends: ControlTrend[];
    risk_trends: RiskTrendPoint[];
    kri_breach_trends: KRIBreachTrendPoint[];
    issue_summary?: IssueDashboardSummary | null;
    issue_aging?: IssueAgingResponse | null;
    issue_severity?: IssueSeverityBreakdownResponse | null;
    generated_at: string;
    capabilities?: DashboardOverviewCapabilities | null;
}

export type RiskLevel = 'all' | 'critical' | 'high' | 'medium' | 'low';

export interface DashboardFilters {
    departmentId: number | null;
    riskLevel: RiskLevel;
    controlStatus: string | null;
    controlForm: string | null;
}
