import { apiClient } from './apiClient';
import type {
    DashboardSummary,
    DepartmentMetrics,
    RiskDistribution,
    ControlTrend,
    DashboardFilters,
    RiskTrendPoint,
    KRIBreachTrendPoint,
    IssueDashboardSummary,
    IssueAgingResponse,
    IssueSeverityBreakdownResponse,
    DashboardOverview,
} from '../types/dashboard';
import type { RiskSummary } from '@/types/risk';

type DashboardQueryParams = Record<string, string | number | boolean | undefined>;

export interface DashboardRiskByCellItem extends Pick<RiskSummary, 'id' | 'risk_id_code' | 'name' | 'description'> {
    net_score: number;
    department_name: string;
    owner_name?: string;
}

export interface DashboardMetricChange {
    absolute: number;
    percentage: number;
    direction: 'up' | 'down' | 'same' | 'unknown';
    note?: string;
}

export interface DashboardQuarterlyComparison {
    this_quarter: Record<string, number>;
    last_quarter: Record<string, number>;
    changes: Record<string, DashboardMetricChange>;
    period: { this_start: string; this_end: string; last_start: string; last_end: string };
    snapshot_info?: {
        current_quarter: string;
        last_quarter: string;
        last_quarter_snapshot_available: boolean;
        period_metrics: string[];
        snapshot_metrics: string[];
    };
}

export interface DashboardCommitteeSummary {
    critical_risks: Array<{
        id: number;
        risk_id_code: string;
        name: string;
        process: string;
        description: string;
        net_score: number;
        is_priority: boolean;
        owner_name: string;
        department_name: string;
    }>;
    recent_activity: Array<{
        id: number;
        action: string;
        entity_type: string;
        entity_name: string;
        description: string;
        created_at: string;
    }>;
    department_exposure: Array<{
        id: number;
        name: string;
        total_exposure: number;
        risk_count: number;
    }>;
    critical_vendors: Array<{
        id: number;
        name: string;
        process: string;
        subprocess?: string | null;
        risk_score_1_5: number;
        supports_important_core_insurance_function: boolean;
        dora_relevant: boolean;
        is_significant_vendor: boolean;
        next_reassessment_due_at?: string | null;
        outsourcing_owner_name: string;
        department_name: string;
    }>;
    vendor_alerts: {
        overdue_reassessments: {
            count: number;
            items: Array<{
                id: number;
                name: string;
                next_reassessment_due_at?: string | null;
                department_name: string;
            }>;
        };
        sla_breaches: {
            count: number;
            items: Array<{
                vendor_id: number;
                vendor_name: string;
                sla_id: number;
                metric_name: string;
                breach_status: string;
                last_reported_at?: string | null;
                department_name: string;
            }>;
        };
        major_incidents_30d: {
            count: number;
            items: Array<{
                vendor_id: number;
                vendor_name: string;
                incident_id: number;
                incident_type: string;
                summary: string;
                occurred_at?: string | null;
                department_name: string;
            }>;
        };
    };
}

function buildQueryParams(filters?: DashboardFilters): DashboardQueryParams {
    if (!filters) return {};

    const params: DashboardQueryParams = {};

    if (filters.departmentId !== null) {
        params.department_id = filters.departmentId;
    }
    if (filters.riskLevel !== 'all') {
        params.risk_level = filters.riskLevel;
    }
    if (filters.controlStatus) {
        params.control_status = filters.controlStatus;
    }
    if (filters.controlForm) {
        params.control_form = filters.controlForm;
    }

    return params;
}

export const dashboardApi = {
    async fetchRisksByCell(
        probability: number,
        impact: number,
        filters?: DashboardFilters,
        riskType: 'gross' | 'net' = 'net',
    ): Promise<DashboardRiskByCellItem[]> {
        const params = buildQueryParams(filters);
        params.probability = probability;
        params.impact = impact;
        params.risk_type = riskType;
        return apiClient.get<DashboardRiskByCellItem[]>('/dashboard/risks-by-cell', { params });
    },

    async fetchDashboardSummary(filters?: DashboardFilters): Promise<DashboardSummary> {
        const params = buildQueryParams(filters);
        return apiClient.get<DashboardSummary>('/dashboard/summary', { params });
    },

    async fetchDepartmentMetrics(filters?: DashboardFilters): Promise<DepartmentMetrics[]> {
        const params = buildQueryParams(filters);
        return apiClient.get<DepartmentMetrics[]>('/dashboard/departments', { params });
    },

    async fetchRiskDistribution(filters?: DashboardFilters, riskType: 'gross' | 'net' = 'net'): Promise<RiskDistribution> {
        const params = buildQueryParams(filters);
        params.risk_type = riskType;
        return apiClient.get<RiskDistribution>('/dashboard/risk-distribution', { params });
    },

    async fetchControlTrends(filters?: DashboardFilters): Promise<ControlTrend[]> {
        const params = buildQueryParams(filters);
        return apiClient.get<ControlTrend[]>('/dashboard/control-trends', { params });
    },

    async fetchRiskTrends(filters?: DashboardFilters): Promise<RiskTrendPoint[]> {
        const params = buildQueryParams(filters);
        return apiClient.get<RiskTrendPoint[]>('/dashboard/risk-trends', { params });
    },

    async fetchKriBreachTrends(filters?: DashboardFilters): Promise<KRIBreachTrendPoint[]> {
        const params = buildQueryParams(filters);
        return apiClient.get<KRIBreachTrendPoint[]>('/dashboard/kri-breach-trends', { params });
    },

    async fetchIssuesSummary(filters?: DashboardFilters): Promise<IssueDashboardSummary> {
        const params = buildQueryParams(filters);
        return apiClient.get<IssueDashboardSummary>('/dashboard/issues-summary', { params });
    },

    async fetchIssuesAging(filters?: DashboardFilters): Promise<IssueAgingResponse> {
        const params = buildQueryParams(filters);
        return apiClient.get<IssueAgingResponse>('/dashboard/issues-aging', { params });
    },

    async fetchIssuesBySeverity(filters?: DashboardFilters): Promise<IssueSeverityBreakdownResponse> {
        const params = buildQueryParams(filters);
        return apiClient.get<IssueSeverityBreakdownResponse>('/dashboard/issues-by-severity', { params });
    },

    async fetchOverview(
        filters?: DashboardFilters,
        options?: { signal?: AbortSignal },
    ): Promise<DashboardOverview> {
        const params = buildQueryParams(filters);
        return apiClient.get<DashboardOverview>('/dashboard/overview', { ...options, params });
    },

    async fetchQuarterlyComparison(
        currentQuarter?: string,
        compareQuarter?: string
    ): Promise<DashboardQuarterlyComparison> {
        const params: Record<string, string> = {};
        if (currentQuarter) params.current_quarter = currentQuarter;
        if (compareQuarter) params.compare_quarter = compareQuarter;
        return apiClient.get<DashboardQuarterlyComparison>('/dashboard/quarterly-comparison', { params });
    },

    async fetchAvailablePeriods(): Promise<{ years: number[]; current_quarter: string }> {
        return apiClient.get<{ years: number[]; current_quarter: string }>('/dashboard/available-periods');
    },

    async fetchCommitteeSummary(): Promise<DashboardCommitteeSummary> {
        return apiClient.get<DashboardCommitteeSummary>('/dashboard/committee-summary');
    },
};
