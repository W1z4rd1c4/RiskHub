import { FilterBar } from '@/components/dashboard/FilterBar';
import type { DashboardOverview, DashboardSummary } from '@/types/dashboard';

import { DashboardRiskSections } from './DashboardRiskSections';
import { DashboardSummarySections } from './DashboardSummarySections';
import type { DashboardStat } from './dashboardStats';

interface DashboardOverviewContentProps {
    breachHistoryTitle: string;
    breachTrends: DashboardOverview['kri_breach_trends'];
    canReadIssues: boolean;
    canUseDepartmentFilter: boolean;
    categoryAnalyticsTitle: string;
    controlExecutionTitle: string;
    departmentMetrics: DashboardOverview['department_metrics'];
    departmentVisibilityTitle: string;
    grossDistribution: DashboardOverview['gross_distribution'] | null;
    grossMatrixTitle: string;
    historicalTitle: string;
    issueAging: DashboardOverview['issue_aging'];
    issueAgingTitle: string;
    issueSeverity: DashboardOverview['issue_severity'];
    issueSeverityTitle: string;
    issueSummary: DashboardOverview['issue_summary'];
    netDistribution: DashboardOverview['net_distribution'] | null;
    netMatrixTitle: string;
    noExecutionHistoryLabel: string;
    onGrossCellClick: (probability: number, impact: number) => void;
    onNetCellClick: (probability: number, impact: number) => void;
    onRiskModalClose: () => void;
    onStatSelect: (path: string) => void;
    riskCreationTitle: string;
    riskModal: {
        impact: number;
        isOpen: boolean;
        probability: number;
        riskType: 'gross' | 'net';
    };
    riskTrends: DashboardOverview['risk_trends'];
    stats: DashboardStat[];
    summary: DashboardSummary | null;
    trends: DashboardOverview['control_trends'];
}

export function DashboardOverviewContent(props: DashboardOverviewContentProps) {
    return (
        <>
            <FilterBar canUseDepartmentFilter={props.canUseDepartmentFilter} />
            <DashboardSummarySections
                canReadIssues={props.canReadIssues}
                categoryAnalyticsTitle={props.categoryAnalyticsTitle}
                issueAging={props.issueAging}
                issueAgingTitle={props.issueAgingTitle}
                issueSeverity={props.issueSeverity}
                issueSeverityTitle={props.issueSeverityTitle}
                issueSummary={props.issueSummary}
                onStatSelect={props.onStatSelect}
                stats={props.stats}
                summary={props.summary}
            />
            <DashboardRiskSections
                breachHistoryTitle={props.breachHistoryTitle}
                breachTrends={props.breachTrends}
                canUseDepartmentFilter={props.canUseDepartmentFilter}
                controlExecutionTitle={props.controlExecutionTitle}
                departmentMetrics={props.departmentMetrics}
                departmentVisibilityTitle={props.departmentVisibilityTitle}
                grossDistribution={props.grossDistribution}
                grossMatrixTitle={props.grossMatrixTitle}
                historicalTitle={props.historicalTitle}
                netDistribution={props.netDistribution}
                netMatrixTitle={props.netMatrixTitle}
                noExecutionHistoryLabel={props.noExecutionHistoryLabel}
                onGrossCellClick={props.onGrossCellClick}
                onNetCellClick={props.onNetCellClick}
                onRiskModalClose={props.onRiskModalClose}
                riskCreationTitle={props.riskCreationTitle}
                riskModal={props.riskModal}
                riskTrends={props.riskTrends}
                trends={props.trends}
            />
        </>
    );
}
