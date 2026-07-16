import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { CollectionFacetOption } from '@/types/collection';
import type { IssueFacets, IssueSeverityFilter, IssueStatus } from '@/types/issue';

import { issueSeverityFacetOptions, issueStatusFacetOptions } from './issueFacetOptions';
import type { IssueRegisterFilters } from './issueRegisterConfig';

type OptionalIssueFilter = 'department_id' | 'owner_user_id' | 'remediation_status';

interface Props {
    facets: IssueFacets;
    filters: IssueRegisterFilters;
    isLoading: boolean;
    onClearAll: () => void;
    onFilterChange: <K extends keyof IssueRegisterFilters>(key: K, value: IssueRegisterFilters[K]) => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    search: string;
}

const withCounts = (options: CollectionFacetOption[]) => options.map((option) => ({ value: option.value, label: `${option.label} (${option.count})`, disabled: option.disabled }));

export function IssuesFilterBar({ facets, filters, isLoading, onClearAll, onFilterChange, onRefresh, onSearchChange, search }: Props) {
    const { t } = useTranslation(['issues', 'common']);
    const selected = useMemo<OptionalIssueFilter[]>(() => [
        ...(filters.department_id !== null ? ['department_id' as const] : []),
        ...(filters.owner_user_id !== null ? ['owner_user_id' as const] : []),
        ...(filters.remediation_status ? ['remediation_status' as const] : []),
    ], [filters]);
    const [activeKeys, setActiveKeys] = useState<OptionalIssueFilter[]>(selected);
    useEffect(() => setActiveKeys((current) => [...new Set([...current, ...selected])]), [selected]);
    const labels = useMemo<Record<OptionalIssueFilter, string>>(() => ({
        department_id: t('columns.department'),
        owner_user_id: t('columns.owner'),
        remediation_status: t('workflow.fields.remediation_status'),
    }), [t]);
    const facetFor = (key: OptionalIssueFilter) => key === 'department_id' ? facets.department ?? [] : key === 'owner_user_id' ? facets.owner ?? [] : facets.remediation_status ?? [];
    const chips = useMemo<RegisterFilterChip[]>(() => [
        ...(filters.status ? [{ key: 'status', label: `${t('filters.all_statuses')}: ${t(`status.${filters.status}`)}` }] : []),
        ...(filters.severity ? [{ key: 'severity', label: `${t('filters.all_severities')}: ${t(`severity.${filters.severity}`)}` }] : []),
        ...(filters.include_closed ? [{ key: 'include_closed', label: t('filters.include_closed') }] : []),
        ...(filters.overdue ? [{ key: 'overdue', label: t('filters.overdue_only') }] : []),
        ...(filters.exclude_active_exceptions ? [{ key: 'exclude_active_exceptions', label: t('filters.exclude_active_exceptions') }] : []),
        ...selected.map((key) => ({ key, label: labels[key] })),
    ], [filters, labels, selected, t]);
    const remove = (key: string) => {
        if (key === 'status') onFilterChange('status', '');
        else if (key === 'severity') onFilterChange('severity', '');
        else if (key === 'include_closed') onFilterChange('include_closed', false);
        else if (key === 'department_id') onFilterChange('department_id', null);
        else if (key === 'owner_user_id') onFilterChange('owner_user_id', null);
        else if (key === 'remediation_status') onFilterChange('remediation_status', '');
        else if (key === 'overdue') onFilterChange('overdue', false);
        else if (key === 'exclude_active_exceptions') onFilterChange('exclude_active_exceptions', false);
        setActiveKeys((current) => current.filter((item) => item !== key));
    };

    return <RegisterListToolbar
        activeFilterCount={chips.length}
        availableFilters={(Object.keys(labels) as OptionalIssueFilter[]).filter((key) => !activeKeys.includes(key)).map((key) => ({ value: key, label: labels[key] }))}
        chips={chips}
        clearAllLabel={t('register.filters.clear_all')}
        filterCountLabel={t('register.filters.active_count', { count: chips.length })}
        filtersLabel={t('register.filters.add')}
        isLoading={isLoading}
        lifecycleControl={<div className="flex flex-wrap gap-3">
            <ThemedSelect value={filters.status} onValueChange={(value) => onFilterChange('status', value as IssueStatus | '')} allowEmpty emptyLabel={t('filters.all_statuses')} triggerAriaLabel={t('filters.all_statuses')} triggerTestId="issues-status-filter-trigger" contentTestId="issues-status-filter-content" optionTestIdPrefix="issues-status-filter-option" options={issueStatusFacetOptions(facets.status, filters.status).map((option) => ({ value: option.value, label: `${t(`status.${option.value}`, option.label)} (${option.count})`, disabled: option.disabled }))} />
            <ThemedSelect value={filters.severity} onValueChange={(value) => onFilterChange('severity', value as IssueSeverityFilter | '')} allowEmpty emptyLabel={t('filters.all_severities')} triggerAriaLabel={t('filters.all_severities')} triggerTestId="issues-severity-filter-trigger" contentTestId="issues-severity-filter-content" optionTestIdPrefix="issues-severity-filter-option" options={issueSeverityFacetOptions(facets.severity, filters.severity).map((option) => ({ value: option.value, label: `${t(`severity.${option.value}`, option.label)} (${option.count})`, disabled: option.disabled }))} />
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-300"><input type="checkbox" checked={filters.include_closed} onChange={(event) => onFilterChange('include_closed', event.target.checked)} className="accent-accent" />{t('filters.include_closed')}</label>
        </div>}
        onAddFilter={(key) => setActiveKeys((current) => [...new Set([...current, key as OptionalIssueFilter])])}
        onClearAll={() => { setActiveKeys([]); onClearAll(); }}
        onRefresh={onRefresh}
        onRemoveFilter={remove}
        onSearchChange={onSearchChange}
        refreshLabel={t('actions.refresh')}
        removeFilterLabel={(label) => t('register.filters.remove', { label })}
        search={search}
        searchPlaceholder={t('filters.search_placeholder')}
        testIdPrefix="issues"
    >
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm text-slate-300"><input type="checkbox" checked={filters.overdue} onChange={(event) => onFilterChange('overdue', event.target.checked)} className="accent-accent" />{t('filters.overdue_only')}</label>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm text-slate-300"><input type="checkbox" checked={filters.exclude_active_exceptions} onChange={(event) => onFilterChange('exclude_active_exceptions', event.target.checked)} className="accent-accent" />{t('filters.exclude_active_exceptions')}</label>
        {activeKeys.map((key) => <div key={key} className="relative rounded-xl border border-white/10 bg-white/[0.025] p-3"><button type="button" aria-label={t('register.filters.remove', { label: labels[key] })} onClick={() => remove(key)} className="absolute right-2 top-2"><X className="h-3.5 w-3.5" aria-hidden="true" /></button><ThemedSelect value={String(filters[key] ?? '')} onValueChange={(value) => key === 'remediation_status' ? onFilterChange('remediation_status', value as IssueRegisterFilters['remediation_status']) : onFilterChange(key, value ? Number(value) : null)} allowEmpty emptyLabel={t('common:filters.all')} triggerAriaLabel={labels[key]} options={withCounts(facetFor(key)).map((option) => key === 'remediation_status' ? { ...option, label: t(`remediation_status.${option.value}`, option.label) } : option)} /></div>)}
    </RegisterListToolbar>;
}
