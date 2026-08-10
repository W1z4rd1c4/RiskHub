import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import type { CollectionFacetOption } from '@/types/collection';
import type { RiskFacets } from '@/types/risk';

import {
    resolveRiskTypeDisplayName,
    type RiskLifecycleFilter,
    type RiskRegisterFilters,
} from './riskRegisterConfig';

type OptionalRiskFilter = 'has_breach' | 'critical';

const NET_BAND_LABEL_KEYS: Readonly<Record<string, string>> = {
    'Nízké': 'low',
    'Střední': 'medium',
    'Vysoké': 'high',
    'Kritické': 'critical',
};

interface Props {
    facets: RiskFacets;
    filters: RiskRegisterFilters;
    isLoading: boolean;
    onClearAll: () => void;
    onFilterChange: <K extends keyof RiskRegisterFilters>(key: K, value: RiskRegisterFilters[K]) => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    search: string;
    isPopulationLocked?: boolean;
}

function booleanControl({
    current,
    anyLabel,
    label,
    noLabel,
    onChange,
    options,
    yesLabel,
}: {
    anyLabel: string;
    current: boolean | null;
    label: string;
    noLabel: string;
    onChange: (value: boolean | null) => void;
    options: CollectionFacetOption[];
    yesLabel: string;
}) {
    const count = (value: boolean) => options.find((option) => option.value === (value ? 'yes' : 'no'));
    return (
        <label className="space-y-2 text-xs font-bold text-slate-300">
            <span>{label}</span>
            <select value={current === null ? '' : String(current)} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'true')} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value="">{anyLabel}</option>
                <option value="true" disabled={Boolean(count(true)?.disabled && current !== true)}>{yesLabel}{count(true) ? ` (${count(true)?.count})` : ''}</option>
                <option value="false" disabled={Boolean(count(false)?.disabled && current !== false)}>{noLabel}{count(false) ? ` (${count(false)?.count})` : ''}</option>
            </select>
        </label>
    );
}

export function RiskRegisterFilterBar({
    facets, filters, isLoading, onClearAll, onFilterChange, onRefresh, onSearchChange, search,
    isPopulationLocked = false,
}: Props) {
    const { t } = useTranslation(['risks', 'common']);
    const { riskTypes } = useRiskTypes();
    const riskTypeLabel = useCallback((code: string, fallback = code) => resolveRiskTypeDisplayName(
        code,
        riskTypes.find((type) => type.code === code)?.display_name ?? fallback,
        (key, defaultValue) => t(key, defaultValue),
    ), [riskTypes, t]);
    const selectedOptional = useMemo<OptionalRiskFilter[]>(() => [
        ...(filters.has_breach !== null ? ['has_breach' as const] : []),
        ...(filters.critical ? ['critical' as const] : []),
    ], [filters.critical, filters.has_breach]);
    const [activeKeys, setActiveKeys] = useState<OptionalRiskFilter[]>(selectedOptional);
    useEffect(() => setActiveKeys((current) => [...new Set([...current, ...selectedOptional])]), [selectedOptional]);
    const labels: Record<OptionalRiskFilter, string> = {
        has_breach: t('register.filters.has_breach'),
        critical: t('register.filters.critical'),
    };
    const netBandLabel = t('register.filters.net_band');
    const selectedNetBandLabel = filters.net_band
        ? t(`register.net_bands.${NET_BAND_LABEL_KEYS[filters.net_band]}`, filters.net_band)
        : '';
    const chips = useMemo<RegisterFilterChip[]>(() => [
        ...(filters.lifecycle !== 'active' ? [{ key: 'lifecycle', label: `${t('register.filters.lifecycle')}: ${t(`register.lifecycle.${filters.lifecycle}`)}` }] : []),
        ...(filters.status !== 'active' ? [{ key: 'status', label: `${t('fields.status')}: ${filters.status ? t(`status.${filters.status}`) : t('filters.all_statuses')}` }] : []),
        ...(filters.risk_type ? [{ key: 'risk_type', label: `${t('fields.type')}: ${riskTypeLabel(filters.risk_type)}` }] : []),
        ...(filters.is_priority !== null ? [{ key: 'is_priority', label: `${t('filters.priority_only')}: ${filters.is_priority ? t('common:actions.yes') : t('common:actions.no')}` }] : []),
        ...(filters.has_breach !== null ? [{ key: 'has_breach', label: labels.has_breach }] : []),
        ...(filters.critical ? [{ key: 'critical', label: labels.critical }] : []),
        ...(filters.net_band ? [{ key: 'net_band', label: `${netBandLabel}: ${selectedNetBandLabel}` }] : []),
    ], [filters, labels.critical, labels.has_breach, netBandLabel, riskTypeLabel, selectedNetBandLabel, t]);
    const remove = (key: string) => {
        if (key === 'lifecycle') onFilterChange('lifecycle', 'active');
        else if (key === 'status') onFilterChange('status', 'active');
        else if (key === 'risk_type') onFilterChange('risk_type', '');
        else if (key === 'is_priority') onFilterChange('is_priority', null);
        else if (key === 'has_breach') onFilterChange('has_breach', null);
        else if (key === 'critical') onFilterChange('critical', false);
        else if (key === 'net_band') onFilterChange('net_band', '');
        if (key === 'has_breach' || key === 'critical') setActiveKeys((current) => current.filter((item) => item !== key));
    };
    const facetOption = (option: CollectionFacetOption, label: string) => ({
        value: option.value, label: `${label} (${option.count})`, disabled: option.disabled,
    });

    return (
        <RegisterListToolbar
            activeFilterCount={chips.length}
            availableFilters={(Object.keys(labels) as OptionalRiskFilter[]).filter((key) => !activeKeys.includes(key)).map((key) => ({ value: key, label: labels[key] }))}
            chips={chips}
            clearAllLabel={t('register.filters.clear_all')}
            filterCountLabel={t('register.filters.active_count', { count: chips.length })}
            filtersLabel={t('register.filters.add')}
            isLoading={isLoading}
            lifecycleControl={<ThemedSelect value={isPopulationLocked ? 'all' : filters.lifecycle} disabled={isPopulationLocked} onValueChange={(value) => onFilterChange('lifecycle', value as RiskLifecycleFilter)} triggerTestId="risks-lifecycle-filter-trigger" contentTestId="risks-lifecycle-filter-content" optionTestIdPrefix="risks-lifecycle-filter-option" options={['active', 'archived', 'all'].map((value) => ({ value, label: t(`register.lifecycle.${value}`) }))} />}
            onAddFilter={(key) => setActiveKeys((current) => [...new Set([...current, key as OptionalRiskFilter])])}
            onClearAll={() => { setActiveKeys([]); onClearAll(); }}
            onRefresh={onRefresh}
            onRemoveFilter={remove}
            onSearchChange={onSearchChange}
            refreshLabel={t('common:actions.refresh')}
            removeFilterLabel={(label) => t('register.filters.remove', { label })}
            search={search}
            searchPlaceholder={t('filters.search_placeholder')}
            testIdPrefix="risks"
        >
            <ThemedSelect value={isPopulationLocked ? '' : filters.status} disabled={isPopulationLocked} onValueChange={(value) => onFilterChange('status', value as RiskRegisterFilters['status'])} allowEmpty emptyLabel={t('filters.all_statuses')} triggerAriaLabel={t('fields.status')} triggerTestId="risks-status-filter-trigger" contentTestId="risks-status-filter-content" optionTestIdPrefix="risks-status-filter-option" options={(facets.status ?? [
                { value: 'active', label: t('status.active'), count: 0, selected: false, disabled: false },
                { value: 'emerging', label: t('status.emerging'), count: 0, selected: false, disabled: false },
            ]).filter((option) => option.value !== 'archived').map((option) => facetOption(option, t(`status.${option.value}`, option.label)))} />
            <ThemedSelect value={filters.risk_type} onValueChange={(value) => onFilterChange('risk_type', value)} allowEmpty emptyLabel={t('filters.all_types')} triggerAriaLabel={t('filters.all_types')} options={(facets.risk_type?.length ? facets.risk_type.map((option) => facetOption(option, riskTypeLabel(option.value, option.label))) : riskTypes.map((type) => ({ value: type.code, label: riskTypeLabel(type.code, type.display_name) })))} />
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300"><input type="checkbox" checked={filters.is_priority === true} onChange={(event) => onFilterChange('is_priority', event.target.checked ? true : null)} className="accent-accent" />{t('filters.priority_only')}</label>
            {activeKeys.map((key) => <div key={key} className="relative rounded-xl border border-white/10 bg-white/[0.025] p-3"><button type="button" aria-label={t('register.filters.remove', { label: labels[key] })} onClick={() => remove(key)} className="absolute right-2 top-2"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>{key === 'has_breach' ? booleanControl({ anyLabel: t('common:filters.all'), current: filters.has_breach, label: labels[key], noLabel: t('common:actions.no'), onChange: (value) => onFilterChange('has_breach', value), options: facets.has_breach ?? [], yesLabel: t('common:actions.yes') }) : <label className="flex items-center gap-2 text-xs font-bold text-slate-300"><input type="checkbox" checked={filters.critical} onChange={(event) => onFilterChange('critical', event.target.checked)} className="accent-accent" />{labels[key]}</label>}</div>)}
        </RegisterListToolbar>
    );
}
