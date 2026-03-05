import { useMemo } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { IssueSeverityFilter, IssueStatus } from '@/types/issue';

import {
    ISSUE_SEVERITIES,
    ISSUE_SEVERITY_GROUPS,
    ISSUE_STATUSES,
} from './issuesPagePresentation';

interface IssuesFilterBarProps {
    excludeActiveExceptions: boolean;
    includeClosed: boolean;
    isLoading: boolean;
    onExcludeActiveExceptionsChange: (value: boolean) => void;
    onIncludeClosedChange: (value: boolean) => void;
    onOverdueOnlyChange: (value: boolean) => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    onSeverityChange: (value: IssueSeverityFilter | '') => void;
    onStatusChange: (value: IssueStatus | '') => void;
    overdueOnly: boolean;
    search: string;
    severityFilter: IssueSeverityFilter | '';
    statusFilter: IssueStatus | '';
}

export function IssuesFilterBar({
    excludeActiveExceptions,
    includeClosed,
    isLoading,
    onExcludeActiveExceptionsChange,
    onIncludeClosedChange,
    onOverdueOnlyChange,
    onRefresh,
    onSearchChange,
    onSeverityChange,
    onStatusChange,
    overdueOnly,
    search,
    severityFilter,
    statusFilter,
}: IssuesFilterBarProps) {
    const { t } = useTranslation('issues');

    const statusOptions = useMemo(
        () =>
            ISSUE_STATUSES.map((value) => ({
                value,
                label: t(`status.${value}`, value.replaceAll('_', ' ')),
            })),
        [t]
    );

    const severityOptions = useMemo(
        () => [
            ...ISSUE_SEVERITIES.map((value) => ({
                value,
                label: t(`severity.${value}`, value),
            })),
            ...ISSUE_SEVERITY_GROUPS.map((value) => ({
                value,
                label: t(`severity.${value}`, value.replaceAll('_', ' ')),
            })),
        ],
        [t]
    );

    return (
        <div className="glass-card flex flex-col md:flex-row md:items-center gap-4">
            <div className="md:flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all min-w-0">
                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors shrink-0" />
                <input
                    type="text"
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t('filters.search_placeholder')}
                    className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                />
            </div>

            <div className="flex w-full md:w-auto items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap">
                <ThemedSelect
                    value={statusFilter}
                    onValueChange={(value) => onStatusChange(value as IssueStatus | '')}
                    options={statusOptions}
                    allowEmpty
                    emptyLabel={t('filters.all_statuses')}
                    placeholder={t('filters.all_statuses')}
                    className="w-[170px]"
                />
                <ThemedSelect
                    value={severityFilter}
                    onValueChange={(value) => onSeverityChange(value as IssueSeverityFilter | '')}
                    options={severityOptions}
                    allowEmpty
                    emptyLabel={t('filters.all_severities')}
                    placeholder={t('filters.all_severities')}
                    className="w-[170px]"
                />
                <label className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center gap-2 text-sm text-slate-300 whitespace-nowrap">
                    <input
                        type="checkbox"
                        checked={overdueOnly}
                        onChange={(event) => onOverdueOnlyChange(event.target.checked)}
                        className="accent-accent"
                    />
                    {t('filters.overdue_only')}
                </label>
                <label className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center gap-2 text-sm text-slate-300 whitespace-nowrap">
                    <input
                        type="checkbox"
                        checked={excludeActiveExceptions}
                        onChange={(event) => onExcludeActiveExceptionsChange(event.target.checked)}
                        className="accent-accent"
                    />
                    {t('filters.exclude_active_exceptions')}
                </label>
                <label className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center gap-2 text-sm text-slate-300 whitespace-nowrap">
                    <input
                        type="checkbox"
                        checked={includeClosed}
                        onChange={(event) => onIncludeClosedChange(event.target.checked)}
                        className="accent-accent"
                    />
                    {t('filters.include_closed')}
                </label>
                <button
                    type="button"
                    onClick={onRefresh}
                    className="h-10 w-10 flex items-center justify-center glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    title={t('actions.refresh')}
                >
                    <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                </button>
            </div>
        </div>
    );
}
