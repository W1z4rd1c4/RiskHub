import type { DashboardSummary, DepartmentMetrics, RiskDistribution, ControlTrend } from '../types/dashboard';

const API_URL = '/api/v1/dashboard';

async function getHeaders(mockUserId: number | null) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (mockUserId) {
        headers['X-Mock-User-Id'] = mockUserId.toString();
    }
    return headers;
}

export const dashboardApi = {
    async fetchDashboardSummary(mockUserId: number | null): Promise<DashboardSummary> {
        const response = await fetch(`${API_URL}/summary`, {
            headers: await getHeaders(mockUserId),
        });
        if (!response.ok) throw new Error('Failed to fetch dashboard summary');
        return response.json();
    },

    async fetchDepartmentMetrics(mockUserId: number | null): Promise<DepartmentMetrics[]> {
        const response = await fetch(`${API_URL}/departments`, {
            headers: await getHeaders(mockUserId),
        });
        if (!response.ok) throw new Error('Failed to fetch department metrics');
        return response.json();
    },

    async fetchRiskDistribution(mockUserId: number | null): Promise<RiskDistribution> {
        const response = await fetch(`${API_URL}/risk-distribution`, {
            headers: await getHeaders(mockUserId),
        });
        if (!response.ok) throw new Error('Failed to fetch risk distribution');
        return response.json();
    },

    async fetchControlTrends(mockUserId: number | null): Promise<ControlTrend[]> {
        const response = await fetch(`${API_URL}/control-trends`, {
            headers: await getHeaders(mockUserId),
        });
        if (!response.ok) throw new Error('Failed to fetch control trends');
        return response.json();
    },
};
