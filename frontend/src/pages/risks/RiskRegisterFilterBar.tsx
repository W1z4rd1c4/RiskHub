import { useCallback, useEffect, useMemo, useState } from 'react';

import { RegisterFilterCard } from '@/components/ict-register/RegisterFilterCard';
import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { buildFilterChip } from '@/components/ict-register/registerFilterChips';
import { Checkbox } from '@/components/ui/checkbox';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import type { CollectionFacetOption } from '@/types/collection';
import type { RiskFacets } from '@/types/risk';

import {
    parseRiskNetBand,
    resolveRiskTypeDisplayName,
    RISK_NET_BAND_CODES,
    type RiskLifecycleFilter,
    type RiskNetBand,
    type RiskRegisterFilters,
} from './riskRegisterConfig';

type OptionalRiskFilter = 'has_breach' | 'critical' | 'net_band';

/** Literal keys so the i18n usage validator sees every band label. */
const NET_BAND_LABEL_KEYS: Readonly<Record<RiskNetBand, string>> = {
    low: 'register.net_bands.low',
    medium: 'register.net_bands.medium',
    high: 'register.net_bands.high',
    critical: 'register.net_bands.critical',
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

const optionCount = (option: CollectionFacetOption | undefined) => (option ? ` (${option.count})` : '');

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
        ...(filters.net_band ? ['net_band' as const] : []),
    ], [filters.critical, filters.has_breach, filters.net_band]);
    const [activeKeys, setActiveKeys] = useState<OptionalRiskFilter[]>(selectedOptional);
    useEffect(() => setActiveKeys((current) => [...new Set([...current, ...selectedOptional])]), [selectedOptional]);
    const labels = useMemo<Record<OptionalRiskFilter, string>>(() => ({
        has_breach: t('register.filters.has_breach'),
        critical: t('register.filters.critical'),
        net_band: t('register.filters.net_band'),
    }), [t]);
    const yesNo = useCallback((value: boolean) => (value ? t('common:actions.yes') : t('common:actions.no')), [t]);
    // PG-05: every chip reads "Label: value" through one whole-phrase key.
    const chips = useMemo<RegisterFilterChip[]>(() => [
        ...(filters.lifecycle !== 'active' ? [buildFilterChip(t, 'lifecycle', t('register.filters.lifecycle'), t(`register.lifecycle.${filters.lifecycle}`))] : []),
        ...(filters.status !== 'active' ? [buildFilterChip(t, 'status', t('fields.status'), filters.status ? t(`status.${filters.status}`) : t('filters.all_statuses'))] : []),
        ...(filters.risk_type ? [buildFilterChip(t, 'risk_type', t('fields.type'), riskTypeLabel(filters.risk_type))] : []),
        ...(filters.is_priority !== null ? [buildFilterChip(t, 'is_priority', t('filters.priority_only'), yesNo(filters.is_priority))] : []),
        ...(filters.has_breach !== null ? [buildFilterChip(t, 'has_breach', labels.has_breach, yesNo(filters.has_breach))] : []),
        ...(filters.critical ? [{ key: 'critical', label: labels.critical }] : []),
        ...(filters.net_band ? [buildFilterChip(t, 'net_band', labels.net_band, t(NET_BAND_LABEL_KEYS[filters.net_band]))] : []),
    ], [filters, labels, riskTypeLabel, t, yesNo]);
    const remove = (key: string) => {
        if (key === 'lifecycle') onFilterChange('lifecycle', 'active');
        else if (key === 'status') onFilterChange('status', 'active');
        else if (key === 'risk_type') onFilterChange('risk_type', '');
        else if (key === 'is_priority') onFilterChange('is_priority', null);
        else if (key === 'has_breach') onFilterChange('has_breach', null);
        else if (key === 'critical') onFilterChange('critical', false);
        else if (key === 'net_band') onFilterChange('net_band', '');
        if (key === 'has_breach' || key === 'critical' || key === 'net_band') setActiveKeys((current) => current.filter((item) => item !== key));
    };
    const facetOption = (option: CollectionFacetOption, label: string) => ({
        value: option.value, label: `${label} (${option.count})`, disabled: option.disabled,
    });
    const renderOptional = (key: OptionalRiskFilter) => {
        if (key === 'critical') {
            return <label className="flex items-center gap-2 text-sm font-medium text-foreground"><Checkbox checked={filters.critical} onCheckedChange={(checked) => onFilterChange('critical', checked)} />{labels.critical}</label>;
        }
        if (key === 'has_breach') {
            const breachOption = (value: boolean) => (facets.has_breach ?? []).find((option) => option.value === (value ? 'yes' : 'no'));
            return <ThemedSelect
                value={filters.has_breach === null ? '' : String(filters.has_breach)}
                onValueChange={(value) => onFilterChange('has_breach', value === '' ? null : value === 'true')}
                allowEmpty
                emptyLabel={t('common:filters.all')}
                triggerAriaLabel={labels.has_breach}
                triggerTestId="risks-has-breach-filter-trigger"
                options={[true, false].map((value) => ({
                    value: String(value),
                    label: `${yesNo(value)}${optionCount(breachOption(value))}`,
                    disabled: Boolean(breachOption(value)?.disabled && filters.has_breach !== value),
                }))}
            />;
        }
        const bandOption = (band: RiskNetBand) => (facets.net_band ?? []).find((option) => parseRiskNetBand(option.value) === band);
        return <ThemedSelect
            value={filters.net_band}
            onValueChange={(value) => onFilterChange('net_band', parseRiskNetBand(value))}
            allowEmpty
            emptyLabel={t('common:filters.all')}
            triggerAriaLabel={labels.net_band}
            triggerTestId="risks-net-band-filter-trigger"
            options={RISK_NET_BAND_CODES.map((band) => ({
                value: band,
                label: `${t(NET_BAND_LABEL_KEYS[band])}${optionCount(bandOption(band))}`,
                disabled: Boolean(bandOption(band)?.disabled && filters.net_band !== band),
            }))}
        />;
    };

    return (
        <RegisterListToolbar
            activeFilterCount={chips.length}
            availableFilters={(Object.keys(labels) as OptionalRiskFilter[]).filter((key) => !activeKeys.includes(key)).map((key) => ({ value: key, label: labels[key] }))}
            chips={chips}
            clearAllLabel={t('register.filters.clear_all')}
            filterCountLabel={t('register.filters.active_count', { count: chips.length })}
            filtersLabel={t('register.filters.add')}
            isLoading={isLoading}
            lifecycleControl={<ThemedSelect value={isPopulationLocked ? 'all' : filters.lifecycle} disabled={isPopulationLocked} onValueChange={(value) => onFilterChange('lifecycle', value as RiskLifecycleFilter)} triggerAriaLabel={t('register.filters.lifecycle')} triggerTestId="risks-lifecycle-filter-trigger" contentTestId="risks-lifecycle-filter-content" optionTestIdPrefix="risks-lifecycle-filter-option" options={['active', 'archived', 'all'].map((value) => ({ value, label: t(`register.lifecycle.${value}`) }))} />}
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
            <ThemedSelect value={filters.risk_type} onValueChange={(value) => onFilterChange('risk_type', value)} allowEmpty emptyLabel={t('filters.all_types')} triggerAriaLabel={t('fields.type')} triggerTestId="risks-type-filter-trigger" contentTestId="risks-type-filter-content" optionTestIdPrefix="risks-type-filter-option" options={(facets.risk_type?.length ? facets.risk_type.map((option) => facetOption(option, riskTypeLabel(option.value, option.label))) : riskTypes.map((type) => ({ value: type.code, label: riskTypeLabel(type.code, type.display_name) })))} />
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-tint/5 px-3 text-sm font-medium text-foreground"><Checkbox checked={filters.is_priority === true} onCheckedChange={(checked) => onFilterChange('is_priority', checked ? true : null)} data-testid="risks-priority-filter" />{t('filters.priority_only')}</label>
            {activeKeys.map((key) => <RegisterFilterCard key={key} removeLabel={t('register.filters.remove', { label: labels[key] })} onRemove={() => remove(key)}>{renderOptional(key)}</RegisterFilterCard>)}
        </RegisterListToolbar>
    );
}
