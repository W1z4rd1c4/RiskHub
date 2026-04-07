import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { useAuthz } from '@/authz/useAuthz';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/i18n/hooks';

import { RiskCommitteeSection } from '@/components/dashboard/RiskCommitteeSection';

import { DashboardErrorState } from './DashboardErrorState';
import { DashboardHeader } from './DashboardHeader';
import { DashboardLoadingState } from './DashboardLoadingState';
import { DashboardOverviewContent } from './DashboardOverviewContent';
import { DashboardViewTabs } from './DashboardViewTabs';
import { exportDashboardSummary, openDashboardPath } from './dashboardNavigation';
import { useDashboardOverviewState } from './useDashboardOverviewState';

export function DashboardPageContainer() {
    const navigate = useNavigate();
    const { filters } = useDashboardFilters();
    const authz = useAuthz();
    const { hasPermission } = usePermissions();
    const { t } = useTranslation('dashboard');
    const canReadIssues = hasPermission('issues', 'read');

    const [selectedCell, setSelectedCell] = useState<{
        probability: number;
        impact: number;
        riskType: 'gross' | 'net';
    } | null>(null);
    const [activeView, setActiveView] = useState<'overview' | 'committee'>('overview');
    const handleStatSelect = (path: string) => {
        openDashboardPath((nextPath) => {
            void navigate(nextPath);
        }, path);
    };

    const canViewCommittee = authz.canViewCommittee;
    const {
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
    } = useDashboardOverviewState({
        canReadIssues,
        filters,
        t,
    });

    if (overviewQuery.isLoading && !summary) {
        return <DashboardLoadingState label={t('loading')} />;
    }

    if (error && !summary) {
        return (
            <DashboardErrorState
                detail={error}
                onRetry={() => {
                    void overviewQuery.refresh();
                }}
                retryLabel={t('errors.retry')}
                title={t('errors.connection_interrupted')}
            />
        );
    }

    return (
        <div className="space-y-10">
            <DashboardHeader
                onExport={() => exportDashboardSummary(filters.departmentId)}
                subtitle={t('page_subtitle')}
                title={t('title')}
                exportLabel={t('actions.export_summary_excel')}
                liveDataLabel={t('live_data')}
            />

            <DashboardViewTabs
                activeView={activeView}
                canViewCommittee={canViewCommittee}
                onChange={setActiveView}
                overviewLabel={t('views.overview')}
                committeeLabel={t('views.risk_committee')}
            />

            {activeView === 'committee' && canViewCommittee ? (
                <RiskCommitteeSection />
            ) : (
                <DashboardOverviewContent
                    breachHistoryTitle={t('sections.kri_breach_history')}
                    breachTrends={breachTrends}
                    canReadIssues={canReadIssues}
                    categoryAnalyticsTitle={t('sections.control_analytics')}
                    controlExecutionTitle={t('sections.control_execution_trends')}
                    departmentMetrics={departmentMetrics}
                    departmentVisibilityTitle={t('sections.departmental_visibility')}
                    grossDistribution={grossDistribution}
                    grossMatrixTitle={t('sections.gross_risk_matrix')}
                    historicalTitle={t('sections.time_series_analysis')}
                    issueAging={issueAging}
                    issueAgingTitle={t('issues.summary.open_by_age')}
                    issueSeverity={issueSeverity}
                    issueSeverityTitle={t('issues.summary.open_by_severity')}
                    issueSummary={issueSummary}
                    netDistribution={netDistribution}
                    netMatrixTitle={t('sections.net_risk_matrix')}
                    noExecutionHistoryLabel={t('sections.no_execution_history')}
                    onGrossCellClick={(probability, impact) =>
                        setSelectedCell({ probability, impact, riskType: 'gross' })
                    }
                    onNetCellClick={(probability, impact) =>
                        setSelectedCell({ probability, impact, riskType: 'net' })
                    }
                    onRiskModalClose={() => setSelectedCell(null)}
                    onStatSelect={handleStatSelect}
                    riskCreationTitle={t('sections.risk_creation_trends')}
                    riskModal={{
                        impact: selectedCell?.impact ?? 0,
                        isOpen: selectedCell !== null,
                        probability: selectedCell?.probability ?? 0,
                        riskType: selectedCell?.riskType ?? 'net',
                    }}
                    riskTrends={riskTrends}
                    stats={stats}
                    summary={summary}
                    trends={trends}
                />
            )}
        </div>
    );
}
