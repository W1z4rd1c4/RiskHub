/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiClient } from './apiClient';
import type { DashboardSummary, DepartmentMetrics, RiskDistribution, ControlTrend, DashboardFilters, RiskTrendPoint, KRIBreachTrendPoint } from '../types/dashboard';

function buildQueryParams(filters?: DashboardFilters): Record<string, any> {
    if (!filters) return {};

    const params: Record<string, any> = {};

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
    async fetchRisksByCell(probability: number, impact: number, filters?: DashboardFilters, riskType: 'gross' | 'net' = 'net'): Promise<any[]> {
        const params = buildQueryParams(filters);
        params.probability = probability;
        params.impact = impact;
        params.risk_type = riskType;
        return apiClient.get<any[]>('/dashboard/risks-by-cell', { params });
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

    async fetchQuarterlyComparison(
        currentQuarter?: string,
        compareQuarter?: string
    ): Promise<any> {
        const params: Record<string, string> = {};
        if (currentQuarter) params.current_quarter = currentQuarter;
        if (compareQuarter) params.compare_quarter = compareQuarter;
        return apiClient.get<any>('/dashboard/quarterly-comparison', { params });
    },

    async fetchAvailablePeriods(): Promise<{ years: number[]; current_quarter: string }> {
        return apiClient.get<{ years: number[]; current_quarter: string }>('/dashboard/available-periods');
    },

    async fetchCommitteeSummary(): Promise<any> {
        return apiClient.get<any>('/dashboard/committee-summary');
    },
};

