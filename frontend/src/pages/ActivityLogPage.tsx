import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthz } from '@/authz/useAuthz';
import { useActivityLogPageState, type ActiveTab } from '@/hooks/useActivityLogPageState';
import { ActivityLogFilterBar } from '@/components/activity-log/ActivityLogFilterBar';
import { ActivityLogEntries } from '@/components/activity-log/ActivityLogEntries';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/tables/Pagination';
import { buttonVariants } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { AccessDeniedState } from '@/components/ui/state';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';

// ─────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────

const ACTIVITY_LOG_TABS_ID_PREFIX = 'activity-log';

const TABS: { id: ActiveTab; labelKey: string }[] = [
    { id: 'kri', labelKey: 'activity_log.entities.kri' },
    { id: 'risk', labelKey: 'activity_log.entities.risk' },
    { id: 'control', labelKey: 'activity_log.entities.controls' },
    { id: 'user', labelKey: 'activity_log.entities.users' },
];

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function ActivityLogPage() {
    const { t } = useTranslation('common');
    const authz = useAuthz();
    const state = useActivityLogPageState();
    const readDenied = state.capabilities !== null && !resolveCapabilityFlag(state.capabilities, 'can_read');

    if (state.outcome.kind === 'denied' || readDenied) {
        return (
            <PageContainer>
                <PageHeader title={t('admin:activity_log.title')} icon={Activity} />
                <AccessDeniedState descriptionKey="access.denied_activity_log" />
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader
                title={t('admin:activity_log.title')}
                description={t('activity_log.subtitle')}
                icon={Activity}
                actions={(
                    <>
                        {authz.canReadControls ? (
                            <Link to="/audit-trail" className={buttonVariants({ variant: 'outline' })}>
                                {t('controls:audit_trail.title')}
                            </Link>
                        ) : null}
                        <RefreshButton
                            iconOnly
                            variant="outline"
                            label={t('tooltips.refresh_log')}
                            onRefresh={() => state.refresh()}
                            isFetching={state.isLoading || state.isSearchSettling}
                        />
                    </>
                )}
            />

            {/* Tabs (AX-07, D8): a real tablist with roving tabindex and arrow keys */}
            <TabList
                variant="pill"
                tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey), testId: `activity-log-tab-${tab.id}` }))}
                activeTab={state.activeTab}
                onChange={state.setActiveTab}
                idPrefix={ACTIVITY_LOG_TABS_ID_PREFIX}
                ariaLabel={t('activity_log.entity_tabs_label')}
                className="self-start"
            />

            {/* Filter Bar (view mode + filters) */}
            <ActivityLogFilterBar
                search={state.search}
                onSearchChange={state.setSearch}
                action={state.action}
                onActionChange={state.setAction}
                actions={state.actions}
                dateFrom={state.dateFrom}
                onDateFromChange={state.setDateFrom}
                dateTo={state.dateTo}
                onDateToChange={state.setDateTo}
                viewMode={state.viewMode}
                onViewModeChange={state.setViewMode}
                selectedActorId={state.selectedActorId}
                onActorChange={state.setSelectedActorId}
                selectedDepartmentId={state.selectedDepartmentId}
                onDepartmentChange={state.setSelectedDepartmentId}
                selectedRiskId={state.selectedRiskId}
                onRiskChange={state.setSelectedRiskId}
                actors={state.actors}
                departments={state.departments}
                risks={state.risks}
                canFilterByDepartment={resolveCapabilityFlag(state.capabilities, 'can_filter_by_department')}
                canViewEntityFilters={resolveCapabilityFlag(state.capabilities, 'can_view_entity_filters')}
            />

            {/* The tab switches the entity whose entries and pages are listed. */}
            <TabPanel
                tab={state.activeTab}
                activeTab={state.activeTab}
                idPrefix={ACTIVITY_LOG_TABS_ID_PREFIX}
                className="flex flex-col gap-6"
            >
                {/* Entries List */}
                <ActivityLogEntries
                    entries={state.entries}
                    outcome={state.outcome}
                    needsRiskSelection={state.needsRiskSelection}
                    onRetry={state.refresh}
                />

                {/* Pagination */}
                {state.total > state.limit && (
                    <Pagination
                        currentPage={state.page + 1}
                        totalPages={Math.ceil(state.total / state.limit)}
                        totalItems={state.total}
                        itemsPerPage={state.limit}
                        isLoading={state.isLoading}
                        onPageChange={(page) => state.setPage(page - 1)}
                    />
                )}
            </TabPanel>
        </PageContainer>
    );
}

export default ActivityLogPage;
