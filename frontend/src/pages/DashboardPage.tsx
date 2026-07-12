import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { useAuthz } from '@/authz/useAuthz';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';

import { RiskCommitteeSection } from '@/components/dashboard/RiskCommitteeSection';
import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';

import { DashboardErrorState } from './dashboard/DashboardErrorState';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DashboardLoadingState } from './dashboard/DashboardLoadingState';
import { DashboardOverviewContent } from './dashboard/DashboardOverviewContent';
import { DashboardViewTabs, type DashboardView } from './dashboard/DashboardViewTabs';
import { exportDashboardSummary, openDashboardPath } from './dashboard/dashboardNavigation';
import { useDashboardOverviewState } from './dashboard/useDashboardOverviewState';

// `?view=` addresses the active dashboard tab (issue #64). Overview is the
// canonical default (no param). A requested view is honored only when the user
// is authorized for it; anything else normalizes to overview (acceptance b).
const VIEW_PARAM = 'view';

function resolveActiveView(
    requested: string | null,
    canViewRiskCommittee: boolean,
    canViewIctCommittee: boolean,
): DashboardView {
    if (requested === 'ict-committee' && canViewIctCommittee) {
        return 'ict-committee';
    }
    if (requested === 'risk-committee' && canViewRiskCommittee) {
        return 'risk-committee';
    }
    return 'overview';
}

export function DashboardPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { filters, setDepartmentId } = useDashboardFilters();
    const authz = useAuthz();
    const { t } = useTranslation('dashboard');

    const [selectedCell, setSelectedCell] = useState<{
        probability: number;
        impact: number;
        riskType: 'gross' | 'net';
    } | null>(null);

    // Both committee tabs gate on SYNCHRONOUS authz capabilities, so tab
    // visibility and the active-view decision never depend on the overview
    // request. ICT uses its own resource permission; the Risk Committee reuses
    // the existing can_view_committee capability. This makes both tabs
    // URL-addressable and independent of the overview fetch (acceptance b/d).
    const canViewIctCommittee = authz.can('read', 'ict_committee');
    const canViewRiskCommittee = authz.canViewCommittee;

    const requestedView = searchParams.get(VIEW_PARAM);
    const activeView = resolveActiveView(requestedView, canViewRiskCommittee, canViewIctCommittee);

    const handleViewChange = (view: DashboardView) => {
        const next = new URLSearchParams(searchParams);
        if (view === 'overview') {
            next.delete(VIEW_PARAM);
        } else {
            next.set(VIEW_PARAM, view);
        }
        // Push a history entry so browser back/forward moves between tabs (c).
        setSearchParams(next);
    };

    // An unauthorized or unrecognized ?view= is normalized away so the address
    // bar matches the overview tab actually shown (acceptance b). Authorized
    // committee views are never stripped, so back/forward keeps working (c).
    useEffect(() => {
        if (requestedView !== null && requestedView !== 'overview' && activeView === 'overview') {
            const next = new URLSearchParams(searchParams);
            next.delete(VIEW_PARAM);
            setSearchParams(next, { replace: true });
        }
    }, [requestedView, activeView, searchParams, setSearchParams]);

    const handleStatSelect = (path: string) => {
        openDashboardPath((nextPath) => {
            void navigate(nextPath);
        }, path);
    };

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
        // The overview request only runs for its own tab; both committee tabs
        // render independently of it (acceptance d).
        enabled: activeView === 'overview',
        filters,
        t,
    });
    const capabilities = overviewQuery.data?.capabilities;
    const canViewIssueMetrics = resolveCapabilityFlag(capabilities, 'can_view_issue_metrics');
    const canExport = resolveCapabilityFlag(capabilities, 'can_export_or_report');
    const canUseDepartmentFilter = resolveCapabilityFlag(capabilities, 'can_use_department_filter');
    const exportDepartmentId = canUseDepartmentFilter ? filters.departmentId : null;

    useEffect(() => {
        if (capabilities !== null && capabilities !== undefined && !resolveCapabilityFlag(capabilities, 'can_use_department_filter') && filters.departmentId !== null) {
            setDepartmentId(null);
        }
    }, [capabilities, filters.departmentId, setDepartmentId]);

    // The overview's own loading / error only replaces the screen while the
    // overview tab is active. Committee tabs are never blocked by the overview
    // request (fixes the former unconditional early-return — acceptance d).
    if (activeView === 'overview' && overviewQuery.isLoading && !summary) {
        return <DashboardLoadingState label={t('loading')} />;
    }

    if (activeView === 'overview' && error && !summary) {
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
                    canExport={canExport}
                    onExport={() => exportDashboardSummary(exportDepartmentId)}
                subtitle={t('page_subtitle')}
                title={t('title')}
                exportLabel={t('actions.export_summary_excel')}
                liveDataLabel={t('live_data')}
            />

            <DashboardViewTabs
                activeView={activeView}
                canViewRiskCommittee={canViewRiskCommittee}
                canViewIctCommittee={canViewIctCommittee}
                onChange={handleViewChange}
                overviewLabel={t('views.overview')}
                riskCommitteeLabel={t('views.risk_committee')}
                ictCommitteeLabel={t('views.ict_committee')}
            />

            {activeView === 'risk-committee' ? (
                <RiskCommitteeSection />
            ) : activeView === 'ict-committee' ? (
                <IctCommitteeSection />
            ) : (
                <DashboardOverviewContent
                    breachHistoryTitle={t('sections.kri_breach_history')}
                    breachTrends={breachTrends}
                    canReadIssues={canViewIssueMetrics}
                    canUseDepartmentFilter={canUseDepartmentFilter}
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

export default DashboardPage;
