import { Activity, RefreshCw, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthz } from '@/authz/useAuthz';
import { useActivityLogPageState, type ActiveTab } from '@/hooks/useActivityLogPageState';
import { ActivityLogFilterBar } from '@/components/activity-log/ActivityLogFilterBar';
import { ActivityLogEntries } from '@/components/activity-log/ActivityLogEntries';
import { ActivityLogPagination } from '@/components/activity-log/ActivityLogPagination';
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
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="p-4 bg-rose-500/10 rounded-2xl">
                    <ShieldX className="h-12 w-12 text-rose-400" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">{t('access.denied')}</h2>
                <p className="text-muted-foreground text-center max-w-md">
                    {t('access.denied_activity_log')}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-xl">
                        <Activity className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">{t('admin:activity_log.title')}</h1>
                        <p className="text-muted-foreground text-sm">{t('activity_log.subtitle')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {authz.canReadControls ? (
                        <Link
                            to="/audit-trail"
                            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-bold text-foreground"
                        >
                            {t('controls:audit_trail.title')}
                        </Link>
                    ) : null}
                    <button
                        onClick={() => state.refresh()}
                        disabled={state.isSearchSettling}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-muted-foreground hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                        title={t('tooltips.refresh_log')}
                        aria-label={t('tooltips.refresh_log')}
                    >
                        <RefreshCw className={`h-5 w-5 ${state.isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </button>
                </div>
            </div>

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
                    <ActivityLogPagination
                        page={state.page}
                        setPage={state.setPage}
                        limit={state.limit}
                        total={state.total}
                        isLoading={state.isLoading}
                    />
                )}
            </TabPanel>
        </div>
    );
}

export default ActivityLogPage;
