import { Activity, RefreshCw, ShieldX } from 'lucide-react';
import { useActivityLogPageState, type ActiveTab } from '@/hooks/useActivityLogPageState';
import { ActivityLogFilterBar } from '@/components/activity-log/ActivityLogFilterBar';
import { ActivityLogEntries } from '@/components/activity-log/ActivityLogEntries';
import { ActivityLogPagination } from '@/components/activity-log/ActivityLogPagination';
import { useTranslation } from '@/i18n/hooks';

// ─────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────

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
    const state = useActivityLogPageState();
    const readDenied = state.capabilities?.can_read === false;

    if (state.errorType === 'access_denied' || readDenied) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="p-4 bg-rose-500/10 rounded-2xl">
                    <ShieldX className="h-12 w-12 text-rose-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">{t('access.denied')}</h2>
                <p className="text-slate-400 text-center max-w-md">
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
                        <p className="text-slate-400 text-sm">{t('activity_log.subtitle')}</p>
                    </div>
                </div>
                <button
                    onClick={() => state.refresh()}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
                    title={t('tooltips.refresh_log')}
                    aria-label={t('tooltips.refresh_log')}
                >
                    <RefreshCw className={`h-5 w-5 ${state.isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => state.setActiveTab(tab.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${state.activeTab === tab.id
                            ? 'bg-accent text-white shadow-lg shadow-accent/25'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {t(tab.labelKey)}
                    </button>
                ))}
            </div>

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
                onActorChange={(id) => { state.setSelectedActorId(id); state.setPage(0); }}
                selectedDepartmentId={state.selectedDepartmentId}
                onDepartmentChange={(id) => { state.setSelectedDepartmentId(id); state.setPage(0); }}
                selectedRiskId={state.selectedRiskId}
                onRiskChange={(id) => { state.setSelectedRiskId(id); state.setPage(0); }}
                users={state.users}
                departments={state.departments}
                risks={state.risks}
                canFilterByDepartment={state.capabilities?.can_filter_by_department === true}
                canViewEntityFilters={state.capabilities?.can_view_entity_filters === true}
            />

            {/* Entries List */}
            <ActivityLogEntries
                entries={state.entries}
                isLoading={state.isLoading}
                errorType={state.errorType}
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
        </div>
    );
}

export default ActivityLogPage;
