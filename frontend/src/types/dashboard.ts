export interface DashboardSummary {
    total_controls: number;
    controls_by_status: Record<string, number>;
    controls_by_form: Record<string, number>;
    controls_by_frequency: Record<string, number>;
    total_risks: number;
    risks_by_status: Record<string, number>;
    critical_risks_count: number;
    average_net_risk_score: number;
}

export interface DepartmentMetrics {
    department_id: number;
    department_name: string;
    control_count: number;
    risk_count: number;
    high_risk_count: number;
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
