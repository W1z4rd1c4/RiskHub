import { AlertCircle, AlertTriangle, RefreshCw, Search, Star } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import type { RiskStatus } from '@/types/risk';

interface RisksFilterBarProps {
    criticalFilter: boolean;
    hasBreachFilter: boolean | undefined;
    isLoading: boolean;
    onClearCriticalFilter: () => void;
    onClearHasBreachFilter: () => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    onStatusChange: (value: RiskStatus | '') => void;
    onTogglePriorityFilter: () => void;
    onTypeChange: (value: string) => void;
    priorityFilter: boolean | undefined;
    search: string;
    statusFilter: RiskStatus | '';
    typeFilter: string;
}

export function RisksFilterBar({
    criticalFilter,
    hasBreachFilter,
    isLoading,
    onClearCriticalFilter,
    onClearHasBreachFilter,
    onRefresh,
    onSearchChange,
    onStatusChange,
    onTogglePriorityFilter,
    onTypeChange,
    priorityFilter,
    search,
    statusFilter,
    typeFilter,
}: RisksFilterBarProps) {
    const { t } = useTranslation('risks');
    const { riskTypes } = useRiskTypes();

    return (
        <div className="glass-card flex flex-col md:flex-row gap-4">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                <input
                    data-testid="risks-search-input"
                    type="text"
                    placeholder={t('filters.search_placeholder')}
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                />
            </div>
            <div className="flex gap-4 items-center">
                <ThemedSelect
                    value={statusFilter}
                    onValueChange={(value) => onStatusChange(value as RiskStatus | '')}
                    placeholder={t('status.active')}
                    triggerAriaLabel={t('fields.status')}
                    triggerTestId="risks-status-filter-trigger"
                    contentTestId="risks-status-filter-content"
                    optionTestIdPrefix="risks-status-filter-option"
                    options={[
                        { value: 'active', label: t('status.active') },
                        { value: 'emerging', label: t('status.emerging') },
                        { value: 'archived', label: t('status.archived') },
                    ]}
                />
                <ThemedSelect
                    value={typeFilter}
                    onValueChange={onTypeChange}
                    placeholder={t('filters.all_types')}
                    triggerAriaLabel={t('filters.all_types')}
                    allowEmpty
                    emptyLabel={t('filters.all_types')}
                    triggerTestId="risks-type-filter-trigger"
                    contentTestId="risks-type-filter-content"
                    optionTestIdPrefix="risks-type-filter-option"
                    options={riskTypes.map((riskType) => ({
                        value: riskType.code,
                        label: riskType.display_name,
                    }))}
                />
                <button
                    type="button"
                    onClick={onTogglePriorityFilter}
                    className={`p-2.5 rounded-xl border transition-all ${
                        priorityFilter === true
                            ? 'bg-amber-400/20 border-amber-400/50 text-amber-400'
                            : 'glass text-slate-400 hover:text-white'
                    }`}
                    title={t('filters.priority_only')}
                >
                    <Star className="h-5 w-5" />
                </button>
                {criticalFilter && (
                    <button
                        type="button"
                        onClick={onClearCriticalFilter}
                        className="p-2.5 rounded-xl border bg-rose-400/20 border-rose-400/50 text-rose-400"
                        title={t('filters.critical_only_clear')}
                    >
                        <AlertTriangle className="h-5 w-5" />
                    </button>
                )}
                {hasBreachFilter && (
                    <button
                        type="button"
                        onClick={onClearHasBreachFilter}
                        className="p-2.5 rounded-xl border bg-rose-400/20 border-rose-400/50 text-rose-400"
                        title={t('filters.breached_only_clear')}
                    >
                        <AlertCircle className="h-5 w-5" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={onRefresh}
                    data-testid="risks-refresh-button"
                    aria-label={t('actions.refresh', { ns: 'common' })}
                    title={t('actions.refresh', { ns: 'common' })}
                    className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                    <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                </button>
            </div>
        </div>
    );
}
