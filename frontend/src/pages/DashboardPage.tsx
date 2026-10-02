import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { useAuthz } from '@/authz/useAuthz';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { logError } from '@/services/logger';
import type { DashboardFilters } from '@/types/dashboard';

import { RiskCommitteeSection } from '@/components/dashboard/RiskCommitteeSection';
import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';

import { DashboardErrorState } from './dashboard/DashboardErrorState';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DashboardLoadingState } from './dashboard/DashboardLoadingState';
import { DashboardOverviewContent } from './dashboard/DashboardOverviewContent';
import {
    DASHBOARD_VIEW_TABS_ID_PREFIX,
    DashboardViewTabs,
    type DashboardView,
} from './dashboard/DashboardViewTabs';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';
import { TabPanel } from '@/components/ui/tabs';
import { exportDashboardSummary } from './dashboard/dashboardNavigation';
import { useDashboardOverviewState } from './dashboard/useDashboardOverviewState';
import {
    buildDashboardFilterUrlParams,
    dashboardFilterSnapshotsEqual,
    parseDashboardFilterUrlState,
} from './dashboard/dashboardFilterUrlState';

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
    // URL filter hydration temporarily unmounts the content. Keep the initiating
    // export snapshot here so a delayed result or Retry survives that transition.
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<DashboardFilters | null>(null);
    const handleExport = async (filters: DashboardFilters) => {
        const snapshot = { ...filters };
        setIsExporting(true);
        setExportError(null);
        try {
            await exportDashboardSummary(snapshot);
        } catch (error) {
            logError('Failed to export dashboard summary.', error);
            setExportError(snapshot);
        } finally {
            setIsExporting(false);
        }
    };

    const [searchParams, setSearchParams] = useSearchParams();
    const { filters, replaceSnapshot, viewMode } = useDashboardFilters();
    const { t } = useTranslation('dashboard');
    const serializedParams = searchParams.toString();
    const requestedSnapshot = useMemo(
        () => parseDashboardFilterUrlState(searchParams),
        [searchParams],
    );
    const canonicalParams = useMemo(
        () => buildDashboardFilterUrlParams(
            requestedSnapshot.filters,
            requestedSnapshot.viewMode,
            searchParams,
        ),
        [requestedSnapshot, searchParams],
    );
    const canonicalSerialized = canonicalParams.toString();
    const currentSnapshot = useMemo(
        () => ({ filters, viewMode }),
        [filters, viewMode],
    );
    const snapshotsMatch = dashboardFilterSnapshotsEqual(currentSnapshot, requestedSnapshot);
    const [observedUrl, setObservedUrl] = useState<string | null>(null);
    const urlChanged = observedUrl !== serializedParams;
    const needsUrlHydration = urlChanged && !snapshotsMatch;

    useLayoutEffect(() => {
        if (observedUrl !== serializedParams) {
            setObservedUrl(serializedParams);
            if (!snapshotsMatch) {
                replaceSnapshot(requestedSnapshot);
            }
        }
    }, [
        replaceSnapshot,
        requestedSnapshot,
        serializedParams,
        snapshotsMatch,
        observedUrl,
    ]);

    useEffect(() => {
        if (serializedParams === canonicalSerialized) return;
        setObservedUrl(canonicalSerialized);
        setSearchParams(canonicalParams, { replace: true });
    }, [canonicalParams, canonicalSerialized, serializedParams, setSearchParams]);

    useEffect(() => {
        if (
            serializedParams !== canonicalSerialized
            || urlChanged
            || snapshotsMatch
            || observedUrl !== serializedParams
        ) return;
        const next = buildDashboardFilterUrlParams(filters, viewMode, searchParams);
        setObservedUrl(next.toString());
        setSearchParams(next);
    }, [
        canonicalSerialized,
        filters,
        observedUrl,
        searchParams,
        serializedParams,
        setSearchParams,
        snapshotsMatch,
        urlChanged,
        viewMode,
    ]);

    if (needsUrlHydration) {
        return <DashboardLoadingState label={t('loading')} />;
    }

    return <DashboardPageContent isExporting={isExporting} exportError={exportError} onExport={handleExport} />;
}

interface DashboardPageContentProps {
    isExporting: boolean;
    exportError: DashboardFilters | null;
    onExport: (snapshot: DashboardFilters) => Promise<void>;
}

function DashboardPageContent({ isExporting, exportError, onExport }: DashboardPageContentProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const { filters } = useDashboardFilters();
    const authz = useAuthz();
    const { t } = useTranslation('dashboard');
    const format = useFormat();
    const { t: tCommon } = useTranslation('common');

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
        canReadControls: authz.canReadControls,
        enabled: activeView === 'overview',
        filters,
        t,
    });
    const capabilities = overviewQuery.data?.capabilities;
    const canViewIssueMetrics = resolveCapabilityFlag(capabilities, 'can_view_issue_metrics');
    const canExport = activeView === 'overview' && resolveCapabilityFlag(capabilities, 'can_export_or_report');
    const canUseDepartmentFilter = resolveCapabilityFlag(capabilities, 'can_use_department_filter');
    const exportFilters = useMemo(() => ({
        ...filters,
        departmentId: canUseDepartmentFilter ? filters.departmentId : null,
    }), [canUseDepartmentFilter, filters]);

    useEffect(() => {
        if (capabilities !== null && capabilities !== undefined && !resolveCapabilityFlag(capabilities, 'can_use_department_filter') && filters.departmentId !== null) {
            const next = new URLSearchParams(searchParams);
            next.delete('departmentId');
            setSearchParams(next, { replace: true });
        }
    }, [capabilities, filters.departmentId, searchParams, setSearchParams]);

    // The overview's own loading / error only replaces the screen while the
    // overview tab is active. Committee tabs are never blocked by the overview
    // request (fixes the former unconditional early-return — acceptance d).
    // D7: the dashboard title is the route's `h1` and `document.title` in every state.
    if (activeView === 'overview' && overviewQuery.isLoading && !summary) {
        return (
            <PageContainer>
                <PageHeader title={t('title')} description={t('page_subtitle')} />
                <DashboardLoadingState label={t('loading')} />
            </PageContainer>
        );
    }

    if (activeView === 'overview' && error && !summary) {
        return (
            <PageContainer>
                <PageHeader title={t('title')} description={t('page_subtitle')} />
                <DashboardErrorState
                    detail={error}
                    onRetry={() => {
                        void overviewQuery.refresh();
                    }}
                    retryLabel={t('errors.retry')}
                    title={t('errors.connection_interrupted')}
                />
            </PageContainer>
        );
    }

    // The view tabs (and their panel) render only when a committee view exists.
    const showViewTabs = canViewRiskCommittee || canViewIctCommittee;
    const viewContent = activeView === 'risk-committee' ? (
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
            filterScope={overviewQuery.data?.filter_scope}
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
    );

    return (
        <PageContainer>
            <DashboardHeader
                canExport={canExport}
                generatedAt={overviewQuery.data?.generated_at}
                isExporting={isExporting}
                isUpdating={overviewQuery.isFetching && Boolean(overviewQuery.data)}
                locale={format.locale}
                onExport={() => void onExport(exportFilters)}
                subtitle={t('page_subtitle')}
                title={t('title')}
                exportLabel={t('actions.export_overview_csv')}
                showFreshness={activeView === 'overview'}
                updateFailed={Boolean(overviewQuery.error && overviewQuery.data)}
                updatedLabel={t('freshness.updated')}
                updatingLabel={t('freshness.updating')}
                updateFailedLabel={t('freshness.update_failed')}
            />

            {exportError && canExport ? (
                <InlineMessage
                    data-testid="dashboard-overview-export-error"
                    tone="danger"
                    action={(
                        <Button
                            variant="outline"
                            size="compact"
                            isLoading={isExporting}
                            onClick={() => void onExport(exportError)}
                        >
                            {tCommon('actions.retry')}
                        </Button>
                    )}
                >
                    {t('errors.export_summary_failed')}
                </InlineMessage>
            ) : null}

            <DashboardViewTabs
                activeView={activeView}
                canViewRiskCommittee={canViewRiskCommittee}
                canViewIctCommittee={canViewIctCommittee}
                onChange={handleViewChange}
                label={t('views.label')}
                overviewLabel={t('views.overview')}
                riskCommitteeLabel={t('views.risk_committee')}
                ictCommitteeLabel={t('views.ict_committee')}
            />

            {showViewTabs ? (
                <TabPanel tab={activeView} activeTab={activeView} idPrefix={DASHBOARD_VIEW_TABS_ID_PREFIX} className="space-y-8">
                    {viewContent}
                </TabPanel>
            ) : (
                <div className="space-y-8">{viewContent}</div>
            )}
        </PageContainer>
    );
}

export default DashboardPage;
