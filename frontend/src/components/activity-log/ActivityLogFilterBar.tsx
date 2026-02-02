import { Search, Calendar, ArrowRight } from 'lucide-react';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { ACTION_LABELS } from '@/types/activityLog';
import type { ViewMode } from '@/hooks/useActivityLogPageState';
import type { UserLookupItem } from '@/services/lookupApi';
import { useTranslation } from '@/i18n/hooks';

export interface ActivityLogFilterBarProps {
    // Search filter
    search: string;
    onSearchChange: (search: string) => void;

    // Action filter
    action: string;
    onActionChange: (action: string) => void;
    actions: string[];

    // Date filters
    dateFrom: string;
    onDateFromChange: (date: string) => void;
    dateTo: string;
    onDateToChange: (date: string) => void;

    // View mode
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;

    // View mode selectors
    selectedActorId: number | null;
    onActorChange: (id: number | null) => void;
    selectedDepartmentId: number | null;
    onDepartmentChange: (id: number | null) => void;
    selectedRiskId: number | null;
    onRiskChange: (id: number | null) => void;

    // Lookup data for selectors
    users: UserLookupItem[];
    departments: { id: number; name: string }[];
    risks: { id: number; name: string }[];
}

const VIEW_MODES: { id: ViewMode; label: string }[] = [
    { id: 'chronological', label: 'Chronological' },
    { id: 'by_person', label: 'By Person' },
    { id: 'by_department', label: 'By Department' },
    { id: 'by_risk', label: 'By Risk' },
];

/**
 * Activity log filter bar component.
 * Renders the view mode selector, entity pickers, and search/date/action filters.
 */
export function ActivityLogFilterBar({
    search,
    onSearchChange,
    action,
    onActionChange,
    actions,
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    viewMode,
    onViewModeChange,
    selectedActorId,
    onActorChange,
    selectedDepartmentId,
    onDepartmentChange,
    selectedRiskId,
    onRiskChange,
    users,
    departments,
    risks,
}: ActivityLogFilterBarProps) {
    const { t } = useTranslation('common');

    return (
        <>
            {/* View Mode Selector */}
            <div className="flex flex-wrap items-center gap-4 p-4 glass-card rounded-2xl border border-white/5">
                <span className="text-sm font-medium text-slate-400">View:</span>
                <div className="flex items-center gap-1">
                    {VIEW_MODES.map(mode => (
                        <button
                            key={mode.id}
                            onClick={() => onViewModeChange(mode.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === mode.id
                                ? 'bg-accent/20 text-accent border border-accent/30'
                                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                                }`}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>

                {/* Conditional pickers based on view mode */}
                {viewMode === 'by_person' && (
                    <ThemedSelect
                        value={selectedActorId?.toString() ?? ''}
                        onValueChange={(v) => onActorChange(v ? Number(v) : null)}
                        placeholder={t('filters.select_person')}
                        className="flex-1 min-w-[200px]"
                        options={users.map(u => ({ value: u.id.toString(), label: `${u.name} (${u.email})` }))}
                    />
                )}

                {viewMode === 'by_department' && (
                    <ThemedSelect
                        value={selectedDepartmentId?.toString() ?? ''}
                        onValueChange={(v) => onDepartmentChange(v ? Number(v) : null)}
                        placeholder={t('filters.select_department')}
                        className="flex-1 min-w-[200px]"
                        options={departments.map(d => ({ value: d.id.toString(), label: d.name }))}
                    />
                )}

                {viewMode === 'by_risk' && (
                    <ThemedSelect
                        value={selectedRiskId?.toString() ?? ''}
                        onValueChange={(v) => onRiskChange(v ? Number(v) : null)}
                        placeholder={t('filters.select_risk')}
                        className="flex-1 min-w-[200px]"
                        options={risks.map(r => ({ value: r.id.toString(), label: r.name }))}
                    />
                )}
            </div>

            {/* Filters Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 glass-card rounded-3xl border border-white/5">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder={t('filters.search_logs')}
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
                    />
                </div>

                <div className="flex gap-2">
                    <ThemedSelect
                        value={action}
                        onValueChange={onActionChange}
                        placeholder={t('filters.all_actions')}
                        allowEmpty
                        emptyLabel={t('filters.all_actions')}
                        className="w-full"
                        options={actions.map(act => ({ value: act, label: ACTION_LABELS[act] || act }))}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => onDateFromChange(e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-accent/50 transition-all"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => onDateToChange(e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-accent/50 transition-all"
                    />
                </div>
            </div>
        </>
    );
}
