import { RefreshCw, Search } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { CONTROL_MONITORING_FILTER_VALUES } from '@/lib/monitoringStatus';

import type { ControlListStatusFilter } from './controlsPagePresentation';

interface ControlsFilterBarProps {
    isLoading: boolean;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    onStatusChange: (value: ControlListStatusFilter) => void;
    search: string;
    statusFilter: ControlListStatusFilter;
}

export function ControlsFilterBar({
    isLoading,
    onRefresh,
    onSearchChange,
    onStatusChange,
    search,
    statusFilter,
}: ControlsFilterBarProps) {
    const { t } = useTranslation('controls');

    return (
        <div className="glass-card flex flex-col md:flex-row gap-4">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                <input
                    data-testid="controls-search-input"
                    type="text"
                    placeholder={t('filters.search_placeholder')}
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                />
            </div>
            <div className="flex gap-4">
                <ThemedSelect
                    value={statusFilter}
                    onValueChange={(value) => onStatusChange(value as ControlListStatusFilter)}
                    placeholder={t('filters.all_statuses')}
                    allowEmpty
                    emptyLabel={t('filters.all_statuses')}
                    triggerTestId="controls-status-filter-trigger"
                    contentTestId="controls-status-filter-content"
                    optionTestIdPrefix="controls-status-filter-option"
                    options={[
                        ...CONTROL_MONITORING_FILTER_VALUES.map((value) => ({
                            value,
                            label: t(`monitoring.${value}`),
                        })),
                        { value: 'archived', label: t('status.archived') },
                    ]}
                />
                <button
                    type="button"
                    onClick={onRefresh}
                    data-testid="controls-refresh-button"
                    className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                    <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                </button>
            </div>
        </div>
    );
}
