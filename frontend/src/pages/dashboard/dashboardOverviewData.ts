import type { DashboardOverview } from '@/types/dashboard';

interface ExtractDashboardOverviewDataOptions {
    data: DashboardOverview | undefined;
    error: unknown;
    t: (key: string) => string;
}

function extractDashboardIssueData(data: DashboardOverview | undefined) {
    return {
        issueAging: data?.issue_aging ?? null,
        issueSeverity: data?.issue_severity ?? null,
        issueSummary: data?.issue_summary ?? null,
    };
}

function extractDashboardTrendData(data: DashboardOverview | undefined) {
    return {
        breachTrends: data?.kri_breach_trends ?? [],
        riskTrends: data?.risk_trends ?? [],
        trends: data?.control_trends ?? [],
    };
}

export function extractDashboardOverviewData({
    data,
    error,
    t,
}: ExtractDashboardOverviewDataOptions) {
    const issueData = extractDashboardIssueData(data);
    const trendData = extractDashboardTrendData(data);

    return {
        departmentMetrics: data?.department_metrics ?? [],
        error: error ? t('errors.load_failed') : null,
        grossDistribution: data?.gross_distribution ?? null,
        netDistribution: data?.net_distribution ?? null,
        summary: data?.summary ?? null,
        ...issueData,
        ...trendData,
    };
}
