import { useEffect, useMemo, useState } from 'react';

import { RegisterFilterCard } from '@/components/ict-register/RegisterFilterCard';
import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { buildFilterChip } from '@/components/ict-register/registerFilterChips';
import { Checkbox } from '@/components/ui/checkbox';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { CollectionFacetOption } from '@/types/collection';
import type { KRIFacets, KRIFrequency, KRILifecycle } from '@/types/kri';

import type { KriRegisterFilters } from './kriRegisterConfig';

type OptionalKriFilter = 'frequency' | 'department_id' | 'reporting_owner_id' | 'breach_only';

interface Props {
    facets: KRIFacets;
    filters: KriRegisterFilters;
    isLoading: boolean;
    onClearAll: () => void;
    onFilterChange: <K extends keyof KriRegisterFilters>(key: K, value: KriRegisterFilters[K]) => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    search: string;
}

const DEFAULT_MONITORING = ['new', 'not_submitted', 'breach', 'warning', 'optimal'] as const;

function optionsWithCounts(options: CollectionFacetOption[], label: (option: CollectionFacetOption) => string) {
    return options.map((option) => ({
        value: option.value,
        label: `${label(option)} (${option.count})`,
        disabled: option.disabled,
    }));
}

export function KriRegisterFilterBar({
    facets,
    filters,
    isLoading,
    onClearAll,
    onFilterChange,
    onRefresh,
    onSearchChange,
    search,
}: Props) {
    const { t } = useTranslation(['kris', 'common']);
    const selected = useMemo<OptionalKriFilter[]>(() => [
        ...(filters.frequency ? ['frequency' as const] : []),
        ...(filters.department_id !== null ? ['department_id' as const] : []),
        ...(filters.reporting_owner_id !== null ? ['reporting_owner_id' as const] : []),
        ...(filters.breach_only ? ['breach_only' as const] : []),
    ], [filters]);
    const [activeKeys, setActiveKeys] = useState<OptionalKriFilter[]>(selected);
    useEffect(() => setActiveKeys((current) => [...new Set([...current, ...selected])]), [selected]);

    const labels = useMemo<Record<OptionalKriFilter, string>>(() => ({
        frequency: t('register.filters.frequency'),
        department_id: t('register.filters.department'),
        reporting_owner_id: t('register.filters.reporting_owner'),
        breach_only: t('filters.breached_only'),
    }), [t]);
    const facetFor = (key: OptionalKriFilter): CollectionFacetOption[] => {
        if (key === 'department_id') return facets.department ?? [];
        if (key === 'reporting_owner_id') return facets.reporting_owner ?? [];
        if (key === 'breach_only') return facets.breach ?? [];
        return facets.frequency ?? [];
    };
    const chipValue = (key: OptionalKriFilter) => {
        const value = filters[key];
        if (key === 'breach_only') return t('common:actions.yes');
        const option = facetFor(key).find((candidate) => candidate.value === String(value));
        return option?.label ?? (key === 'frequency' && value ? t(`frequencies.${value}`, String(value)) : String(value));
    };
    const chips: RegisterFilterChip[] = [
        ...(filters.lifecycle !== 'active' ? [buildFilterChip(t, 'lifecycle', t('register.filters.lifecycle'), t(`register.lifecycle.${filters.lifecycle}`))] : []),
        ...(filters.monitoring_status ? [buildFilterChip(t, 'monitoring_status', t('columns.status'), t(`monitoring.${filters.monitoring_status}`))] : []),
        ...(filters.timeliness_status ? [{ key: 'timeliness_status', label: t('filters.due_soon') }] : []),
        ...selected.map((key) => buildFilterChip(t, key, labels[key], chipValue(key))),
    ];

    const remove = (key: string) => {
        if (key === 'lifecycle') onFilterChange('lifecycle', 'active');
        else if (key === 'monitoring_status') onFilterChange('monitoring_status', '');
        else if (key === 'timeliness_status') onFilterChange('timeliness_status', '');
        else if (key === 'frequency') onFilterChange('frequency', '');
        else if (key === 'department_id') onFilterChange('department_id', null);
        else if (key === 'reporting_owner_id') onFilterChange('reporting_owner_id', null);
        else if (key === 'breach_only') onFilterChange('breach_only', false);
        setActiveKeys((current) => current.filter((item) => item !== key));
    };

    const renderOptional = (key: OptionalKriFilter) => {
        if (key === 'breach_only') {
            return <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={filters.breach_only} onCheckedChange={(checked) => onFilterChange('breach_only', checked)} />
                {labels[key]}
            </label>;
        }
        const current = filters[key];
        return <ThemedSelect
            value={current === null ? '' : String(current)}
            onValueChange={(value) => {
                if (key === 'frequency') onFilterChange('frequency', value as KRIFrequency | '');
                else onFilterChange(key, value ? Number(value) : null);
            }}
            allowEmpty
            emptyLabel={t('common:filters.all')}
            triggerAriaLabel={labels[key]}
            options={optionsWithCounts(facetFor(key), (option) => key === 'frequency' ? t(`frequencies.${option.value}`, option.label) : option.label)}
        />;
    };

    return <RegisterListToolbar
        activeFilterCount={chips.length}
        availableFilters={(Object.keys(labels) as OptionalKriFilter[]).filter((key) => !activeKeys.includes(key)).map((key) => ({ value: key, label: labels[key] }))}
        chips={chips}
        clearAllLabel={t('register.filters.clear_all')}
        filterCountLabel={t('register.filters.active_count', { count: chips.length })}
        filtersLabel={t('register.filters.add')}
        isLoading={isLoading}
        lifecycleControl={<div className="flex flex-wrap gap-3">
            <ThemedSelect value={filters.lifecycle} onValueChange={(value) => onFilterChange('lifecycle', value as KRILifecycle)} triggerAriaLabel={t('register.filters.lifecycle')} triggerTestId="kris-lifecycle-filter-trigger" contentTestId="kris-lifecycle-filter-content" optionTestIdPrefix="kris-lifecycle-filter-option" options={['active', 'archived', 'all'].map((value) => ({ value, label: t(`register.lifecycle.${value}`) }))} />
            <ThemedSelect value={filters.monitoring_status} onValueChange={(value) => onFilterChange('monitoring_status', value as KriRegisterFilters['monitoring_status'])} allowEmpty emptyLabel={t('filters.all')} triggerAriaLabel={t('columns.status')} triggerTestId="kris-monitoring-filter-trigger" contentTestId="kris-monitoring-filter-content" optionTestIdPrefix="kris-monitoring-filter-option" options={(facets.monitoring_status?.length ? facets.monitoring_status : DEFAULT_MONITORING.map((value) => ({ value, label: value, count: 0, selected: false, disabled: false }))).map((option) => ({ value: option.value, label: facets.monitoring_status?.length ? `${t(`monitoring.${option.value}`, option.label)} (${option.count})` : t(`monitoring.${option.value}`, option.label), disabled: option.disabled }))} />
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-tint/5 px-3 text-sm text-foreground"><Checkbox checked={filters.timeliness_status === 'due_soon'} onCheckedChange={(checked) => onFilterChange('timeliness_status', checked ? 'due_soon' : '')} data-testid="kris-due-soon-filter" />{t('filters.due_soon')}</label>
        </div>}
        onAddFilter={(key) => setActiveKeys((current) => [...new Set([...current, key as OptionalKriFilter])])}
        onClearAll={() => { setActiveKeys([]); onClearAll(); }}
        onRefresh={onRefresh}
        onRemoveFilter={remove}
        onSearchChange={onSearchChange}
        refreshLabel={t('common:actions.refresh')}
        removeFilterLabel={(label) => t('register.filters.remove', { label })}
        search={search}
        searchPlaceholder={t('filters.search_placeholder')}
        testIdPrefix="kris"
    >
        {/* PG-25: the monitoring ThemedSelect above is the only status control; the
            duplicate pill row (whose "All" also wiped unrelated filters) is gone. */}
        {activeKeys.map((key) => <RegisterFilterCard key={key} removeLabel={t('register.filters.remove', { label: labels[key] })} onRemove={() => remove(key)}>{renderOptional(key)}</RegisterFilterCard>)}
    </RegisterListToolbar>;
}
