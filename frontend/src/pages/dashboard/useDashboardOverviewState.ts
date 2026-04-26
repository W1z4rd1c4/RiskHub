import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';
import { DASHBOARD_POLL_MS } from '@/config/constants';
import { dashboardApi } from '@/services/dashboardApi';
import type { DashboardFilters, DashboardOverview } from '@/types/dashboard';

import { buildDashboardStats } from './dashboardStats';
import { extractDashboardOverviewData } from './dashboardOverviewData';

interface UseDashboardOverviewStateOptions {
    issuePermissionCacheKey: boolean;
    enabled?: boolean;
    filters: DashboardFilters;
    t: (key: string) => string;
}

export function useDashboardOverviewState({
    issuePermissionCacheKey,
    enabled = true,
    filters,
    t,
}: UseDashboardOverviewStateOptions) {
    const overviewQuery = useAdaptivePollingQuery<DashboardOverview>({
        queryKey: [
            'dashboardOverview',
            filters.departmentId,
            filters.riskLevel,
            filters.controlStatus,
            filters.controlForm,
            issuePermissionCacheKey,
        ],
        queryFn: ({ signal }) => dashboardApi.fetchOverview(filters, { signal }),
        pollMs: DASHBOARD_POLL_MS,
        enabled,
    });

    const {
        breachTrends,
        departmentMetrics,
        error,
        grossDistribution,
        issueAging,
        issueSeverity,
        issueSummary,
        netDistribution,
        riskTrends,
        summary,
        trends,
    } = extractDashboardOverviewData({
        data: overviewQuery.data,
        error: overviewQuery.error,
        t,
    });
    const stats = buildDashboardStats({
        canReadIssues: overviewQuery.data?.capabilities?.can_view_issue_metrics === true,
        departmentMetrics,
        issueSummary,
        summary,
        t,
    });

    return {
        breachTrends,
        departmentMetrics,
        error,
        grossDistribution,
        issueAging,
        issueSeverity,
        issueSummary,
        netDistribution,
        overviewQuery,
        riskTrends,
        stats,
        summary,
        trends,
    };
}
