import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import type { CollectionFacetOption } from '@/types/collection';
import type { ControlFacets } from '@/types/control';

import type { ControlLifecycleFilter, ControlRegisterFilters } from './controlRegisterConfig';

type OptionalControlFilter = 'status' | 'process' | 'category';

interface Props {
    facets: ControlFacets; filters: ControlRegisterFilters; isLoading: boolean; onClearAll: () => void;
    onFilterChange: <K extends keyof ControlRegisterFilters>(key: K, value: ControlRegisterFilters[K]) => void;
    onRefresh: () => void; onSearchChange: (value: string) => void; search: string;
}

export function ControlRegisterFilterBar({ facets, filters, isLoading, onClearAll, onFilterChange, onRefresh, onSearchChange, search }: Props) {
    const { t } = useTranslation(['controls', 'common']);
    const selected = useMemo<OptionalControlFilter[]>(() => (['status', 'process', 'category'] as const).filter((key) => Boolean(filters[key])), [filters]);
    const [activeKeys, setActiveKeys] = useState<OptionalControlFilter[]>(selected);
    useEffect(() => setActiveKeys((current) => [...new Set([...current, ...selected])]), [selected]);
    const labels = useMemo<Record<OptionalControlFilter, string>>(() => ({
        status: t('fields.status'), process: t('register.filters.process'), category: t('register.filters.category'),
    }), [t]);
    const filterValueLabel = useCallback((key: OptionalControlFilter, value: string, fallback = value) => (
        key === 'status' ? t(`status.${value}`, fallback) : fallback
    ), [t]);
    const chips = useMemo<RegisterFilterChip[]>(() => [
        ...(filters.lifecycle !== 'active' ? [{ key: 'lifecycle', label: `${t('register.filters.lifecycle')}: ${t(`register.lifecycle.${filters.lifecycle}`)}` }] : []),
        ...(filters.monitoring_status ? [{ key: 'monitoring_status', label: `${t('columns.status')}: ${t(`monitoring.${filters.monitoring_status}`)}` }] : []),
        ...selected.map((key) => ({ key, label: `${labels[key]}: ${filterValueLabel(key, filters[key])}` })),
    ], [filterValueLabel, filters, labels, selected, t]);
    const remove = (key: string) => {
        if (key === 'lifecycle') onFilterChange('lifecycle', 'active');
        else if (key === 'monitoring_status') onFilterChange('monitoring_status', '');
        else { onFilterChange(key as OptionalControlFilter, ''); setActiveKeys((current) => current.filter((item) => item !== key)); }
    };
    const facetFor = (key: OptionalControlFilter): CollectionFacetOption[] => facets[key] ?? [];
    return <RegisterListToolbar activeFilterCount={chips.length}
        availableFilters={(Object.keys(labels) as OptionalControlFilter[]).filter((key) => !activeKeys.includes(key)).map((key) => ({ value: key, label: labels[key] }))}
        chips={chips} clearAllLabel={t('register.filters.clear_all')} filterCountLabel={t('register.filters.active_count', { count: chips.length })}
        filtersLabel={t('register.filters.add')} isLoading={isLoading}
        lifecycleControl={<div className="flex gap-3"><ThemedSelect value={filters.lifecycle} onValueChange={(value) => onFilterChange('lifecycle', value as ControlLifecycleFilter)} triggerAriaLabel={t('register.filters.lifecycle')} triggerTestId="controls-lifecycle-filter-trigger" contentTestId="controls-lifecycle-filter-content" optionTestIdPrefix="controls-lifecycle-filter-option" options={['active', 'archived', 'all'].map((value) => ({ value, label: t(`register.lifecycle.${value}`) }))} /><ThemedSelect value={filters.monitoring_status} onValueChange={(value) => onFilterChange('monitoring_status', value as ControlRegisterFilters['monitoring_status'])} allowEmpty emptyLabel={t('filters.all_statuses')} triggerAriaLabel={t('filters.all_statuses')} triggerTestId="controls-status-filter-trigger" contentTestId="controls-status-filter-content" optionTestIdPrefix="controls-status-filter-option" options={(facets.monitoring_status?.length ? facets.monitoring_status : ['new', 'needs_review', 'failed', 'passed'].map((value) => ({ value, label: value, count: 0, selected: false, disabled: false }))).map((option) => ({ value: option.value, label: facets.monitoring_status?.length ? `${t(`monitoring.${option.value}`, option.label)} (${option.count})` : t(`monitoring.${option.value}`, option.label), disabled: option.disabled }))} /></div>}
        onAddFilter={(key) => setActiveKeys((current) => [...new Set([...current, key as OptionalControlFilter])])}
        onClearAll={() => { setActiveKeys([]); onClearAll(); }} onRefresh={onRefresh} onRemoveFilter={remove}
        onSearchChange={onSearchChange} refreshLabel={t('common:actions.refresh')} removeFilterLabel={(label) => t('register.filters.remove', { label })}
        search={search} searchPlaceholder={t('filters.search_placeholder')} testIdPrefix="controls">
        {activeKeys.map((key) => <div key={key} className="relative rounded-xl border border-white/10 bg-white/[0.025] p-3 pr-12"><Button variant="secondary" size="iconCompact" aria-label={t('register.filters.remove', { label: labels[key] })} onClick={() => remove(key)} className="absolute right-2 top-2"><X aria-hidden="true" /></Button><ThemedSelect value={filters[key]} onValueChange={(value) => onFilterChange(key, value)} allowEmpty emptyLabel={t('common:filters.all')} triggerAriaLabel={labels[key]} options={facetFor(key).map((option) => ({ value: option.value, label: `${filterValueLabel(key, option.value, option.label)} (${option.count})`, disabled: option.disabled }))} /></div>)}
    </RegisterListToolbar>;
}
