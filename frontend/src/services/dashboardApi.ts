import { apiClient } from './apiClient';
import {
    controlTrendSchema,
    dashboardCommitteeSummarySchema,
    dashboardOverviewSchema,
    dashboardQuarterlyComparisonSchema,
    dashboardRiskByCellItemArraySchema,
    dashboardSummarySchema,
    departmentMetricsSchema,
    issueAgingResponseSchema,
    issueDashboardSummarySchema,
    issueSeverityBreakdownResponseSchema,
    kriBreachTrendPointSchema,
    riskDistributionSchema,
    riskTrendPointSchema,
    z,
} from '@/services/api/schemas';
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
        outsourcing_owner_name: string;
        department_name: string;
    }>;
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
        return apiClient.get('/dashboard/risks-by-cell', {
            params,
            schema: dashboardRiskByCellItemArraySchema,
        });
    },

    async fetchDashboardSummary(filters?: DashboardFilters): Promise<DashboardSummary> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/summary', { params, schema: dashboardSummarySchema });
    },

    async fetchDepartmentMetrics(filters?: DashboardFilters): Promise<DepartmentMetrics[]> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/departments', {
            params,
            schema: z.array(departmentMetricsSchema),
        });
    },

    async fetchRiskDistribution(filters?: DashboardFilters, riskType: 'gross' | 'net' = 'net'): Promise<RiskDistribution> {
        const params = buildQueryParams(filters);
        params.risk_type = riskType;
        return apiClient.get('/dashboard/risk-distribution', {
            params,
            schema: riskDistributionSchema,
        });
    },

    async fetchControlTrends(filters?: DashboardFilters): Promise<ControlTrend[]> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/control-trends', { params, schema: z.array(controlTrendSchema) });
    },

    async fetchRiskTrends(filters?: DashboardFilters): Promise<RiskTrendPoint[]> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/risk-trends', { params, schema: z.array(riskTrendPointSchema) });
    },

    async fetchKriBreachTrends(filters?: DashboardFilters): Promise<KRIBreachTrendPoint[]> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/kri-breach-trends', {
            params,
            schema: z.array(kriBreachTrendPointSchema),
        });
    },

    async fetchIssuesSummary(filters?: DashboardFilters): Promise<IssueDashboardSummary> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/issues-summary', {
            params,
            schema: issueDashboardSummarySchema,
        });
    },

    async fetchIssuesAging(filters?: DashboardFilters): Promise<IssueAgingResponse> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/issues-aging', {
            params,
            schema: issueAgingResponseSchema,
        });
    },

    async fetchIssuesBySeverity(filters?: DashboardFilters): Promise<IssueSeverityBreakdownResponse> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/issues-by-severity', {
            params,
            schema: issueSeverityBreakdownResponseSchema,
        });
    },

    async fetchOverview(
        filters?: DashboardFilters,
        options?: { signal?: AbortSignal },
    ): Promise<DashboardOverview> {
        const params = buildQueryParams(filters);
        return apiClient.get('/dashboard/overview', {
            ...options,
            params,
            schema: dashboardOverviewSchema,
        });
    },

    async fetchQuarterlyComparison(
        currentQuarter?: string,
        compareQuarter?: string
    ): Promise<DashboardQuarterlyComparison> {
        const params: Record<string, string> = {};
        if (currentQuarter) params.current_quarter = currentQuarter;
        if (compareQuarter) params.compare_quarter = compareQuarter;
        return apiClient.get('/dashboard/quarterly-comparison', {
            params,
            schema: dashboardQuarterlyComparisonSchema,
        });
    },

    async fetchAvailablePeriods(): Promise<{ years: number[]; current_quarter: string }> {
        return apiClient.get('/dashboard/available-periods', {
            schema: z.object({
                years: z.array(z.number()),
                current_quarter: z.string(),
            }).passthrough(),
        });
    },

    async fetchCommitteeSummary(): Promise<DashboardCommitteeSummary> {
        return apiClient.get('/dashboard/committee-summary', {
            schema: dashboardCommitteeSummarySchema,
        });
    },
};
