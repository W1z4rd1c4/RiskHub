import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { threatApi } from '@/services/threatApi';
import type { ThreatFacetOption, ThreatFacets, ThreatLookupOption } from '@/types/threat';

import {
    THREAT_REGISTER_CONFIG,
    type ThreatFilterKey,
    type ThreatLifecycleFilter,
    type ThreatRegisterFilterDefinition,
    type ThreatRegisterFilters,
} from './threatRegisterConfig';

const FACET_KEYS: Partial<Record<ThreatFilterKey, keyof ThreatFacets>> = {
    categories: 'category',
    relevant_subjects: 'relevant_subject',
    linked_risk_types: 'linked_risk_type',
};

function hasFilterValue(filters: ThreatRegisterFilters, key: ThreatFilterKey): boolean {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'boolean';
}

function emptyValue(key: ThreatFilterKey): ThreatRegisterFilters[ThreatFilterKey] {
    return key === 'has_linked_risk' ? null : [];
}

interface RemoteMultiFilterProps {
    definition: ThreatRegisterFilterDefinition;
    label: string;
    onChange: (value: number[]) => void;
    selectedIds: number[];
}

function RemoteMultiFilter({ definition, label, onChange, selectedIds }: RemoteMultiFilterProps) {
    const { t } = useTranslation('threats');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 250);
    const [options, setOptions] = useState<ThreatLookupOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!definition.lookup) return;
        let active = true;
        setIsLoading(true);
        void threatApi.getLookupOptions(definition.lookup, {
            search: debouncedSearch.trim() || undefined,
            selectedIds,
        }).then((result) => {
            if (active) setOptions(result);
        }).catch(() => {
            if (active) setOptions([]);
        }).finally(() => {
            if (active) setIsLoading(false);
        });
        return () => { active = false; };
    }, [debouncedSearch, definition.lookup, selectedIds]);

    return (
        <fieldset className="space-y-2" data-testid={`threats-filter-control-${definition.key}`}>
            <legend className="text-xs font-bold text-slate-300">{label}</legend>
            <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('register.filters.search_options')}
                aria-label={t('register.filters.search_options_for', { label })}
                data-testid={`threats-filter-${definition.key}-search`}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
            />
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-white/5 p-2" aria-busy={isLoading}>
                {options.map((option) => {
                    const checked = selectedIds.includes(option.id);
                    return (
                        <label key={option.id} className="flex items-start gap-2 rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                            <input
                                type="checkbox"
                                checked={checked}
                                disabled={option.disabled && !checked}
                                data-testid={`threats-filter-${definition.key}-option-${option.id}`}
                                onChange={() => onChange(checked
                                    ? selectedIds.filter((id) => id !== option.id)
                                    : [...selectedIds, option.id])}
                                className="mt-0.5 accent-accent"
                            />
                            <span className="min-w-0">
                                <span className="block truncate">{option.label}</span>
                                {option.secondary_label ? <span className="block truncate text-slate-500">{option.secondary_label}</span> : null}
                            </span>
                        </label>
                    );
                })}
                {!isLoading && options.length === 0 ? <p className="px-2 py-1 text-xs text-slate-500">{t('register.filters.no_options')}</p> : null}
            </div>
        </fieldset>
    );
}

function FacetMultiFilter({
    definition,
    label,
    onChange,
    options,
    selected,
}: {
    definition: ThreatRegisterFilterDefinition;
    label: string;
    onChange: (value: string[]) => void;
    options: ThreatFacetOption[];
    selected: string[];
}) {
    return (
        <fieldset className="space-y-2" data-testid={`threats-filter-control-${definition.key}`}>
            <legend className="text-xs font-bold text-slate-300">{label}</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/5 p-2">
                {options.map((option) => {
                    const checked = selected.includes(option.value);
                    return (
                        <label key={option.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                            <span className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={option.disabled && !checked}
                                    onChange={() => onChange(checked
                                        ? selected.filter((value) => value !== option.value)
                                        : [...selected, option.value])}
                                    className="accent-accent"
                                />
                                {option.label}
                            </span>
                            <span className="tabular-nums text-slate-500">{option.count}</span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

interface ThreatRegisterFilterBarProps {
    facets: ThreatFacets;
    filters: ThreatRegisterFilters;
    isLoading: boolean;
    onClearAll: () => void;
    onFilterChange: <K extends keyof ThreatRegisterFilters>(key: K, value: ThreatRegisterFilters[K]) => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    search: string;
}

export function ThreatRegisterFilterBar({
    facets,
    filters,
    isLoading,
    onClearAll,
    onFilterChange,
    onRefresh,
    onSearchChange,
    search,
}: ThreatRegisterFilterBarProps) {
    const { t } = useTranslation(['threats', 'common']);
    const selectedFromUrl = useMemo(
        () => THREAT_REGISTER_CONFIG.filters.filter(({ key }) => hasFilterValue(filters, key)).map(({ key }) => key),
        [filters],
    );
    const [activeKeys, setActiveKeys] = useState<ThreatFilterKey[]>(selectedFromUrl);

    useEffect(() => {
        setActiveKeys((current) => [...new Set([...current, ...selectedFromUrl])]);
    }, [selectedFromUrl]);

    const labels = useMemo(() => Object.fromEntries(THREAT_REGISTER_CONFIG.filters.map((definition) => [
        definition.key,
        t(definition.labelKey),
    ])) as Record<ThreatFilterKey, string>, [t]);

    const chips = useMemo<RegisterFilterChip[]>(() => [
        ...(filters.lifecycle !== 'active'
            ? [{ key: 'lifecycle', label: `${t('register.filters.lifecycle')}: ${t(`register.lifecycle.${filters.lifecycle}`)}` }]
            : []),
        ...THREAT_REGISTER_CONFIG.filters
            .filter(({ key }) => hasFilterValue(filters, key))
            .map(({ key }) => ({ key, label: labels[key] })),
    ], [filters, labels, t]);

    const removeFilter = (key: string) => {
        if (key === 'lifecycle') {
            onFilterChange('lifecycle', 'active');
            return;
        }
        const typedKey = key as ThreatFilterKey;
        onFilterChange(typedKey, emptyValue(typedKey));
        setActiveKeys((current) => current.filter((candidate) => candidate !== typedKey));
    };

    const renderControl = (definition: ThreatRegisterFilterDefinition) => {
        const label = labels[definition.key];
        if (definition.kind === 'remote') {
            return (
                <RemoteMultiFilter
                    key={definition.key}
                    definition={definition}
                    label={label}
                    selectedIds={filters[definition.key] as number[]}
                    onChange={(value) => onFilterChange(definition.key, value)}
                />
            );
        }
        if (definition.kind === 'facet') {
            const localizeOption = (option: ThreatFacetOption): ThreatFacetOption => {
                if (definition.key === 'categories') {
                    return { ...option, label: t(`categories.${option.value}`, t('register.values.unknown')) };
                }
                if (definition.key === 'linked_risk_types') {
                    return { ...option, label: t(`register.risk_types.${option.value}`, t('register.values.unknown')) };
                }
                return option;
            };
            return (
                <FacetMultiFilter
                    key={definition.key}
                    definition={definition}
                    label={label}
                    options={(facets[FACET_KEYS[definition.key] ?? 'category'] ?? []).map(localizeOption)}
                    selected={filters[definition.key] as string[]}
                    onChange={(value) => onFilterChange(definition.key, value)}
                />
            );
        }
        const current = filters.has_linked_risk;
        const facetOptions = facets.has_linked_risk ?? [];
        const trueFacet = facetOptions.find((option) => option.value === 'yes');
        const falseFacet = facetOptions.find((option) => option.value === 'no');
        const withCount = (translationKey: string, option: ThreatFacetOption | undefined) => (
            option ? `${t(translationKey)} (${option.count})` : t(translationKey)
        );
        return (
            <label key={definition.key} className="space-y-2 text-xs font-bold text-slate-300" data-testid="threats-filter-control-has_linked_risk">
                <span>{label}</span>
                <select
                    value={current === null ? '' : String(current)}
                    onChange={(event) => onFilterChange('has_linked_risk', event.target.value === '' ? null : event.target.value === 'true')}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                    <option value="">{t('register.boolean.any')}</option>
                    <option value="true" disabled={Boolean(trueFacet?.disabled && current !== true)}>{withCount('register.boolean.yes', trueFacet)}</option>
                    <option value="false" disabled={Boolean(falseFacet?.disabled && current !== false)}>{withCount('register.boolean.no', falseFacet)}</option>
                </select>
            </label>
        );
    };

    const lifecycleFacets = new Map((facets.lifecycle ?? []).map((option) => [option.value, option]));

    return (
        <RegisterListToolbar
            activeFilterCount={chips.length}
            availableFilters={THREAT_REGISTER_CONFIG.filters
                .filter(({ key }) => !activeKeys.includes(key))
                .map(({ key }) => ({ value: key, label: labels[key] }))}
            chips={chips}
            clearAllLabel={t('register.filters.clear_all')}
            filterCountLabel={t('register.filters.active_count', { count: chips.length })}
            filtersLabel={t('register.filters.add')}
            isLoading={isLoading}
            lifecycleControl={(
                <ThemedSelect
                    value={filters.lifecycle}
                    onValueChange={(value) => onFilterChange('lifecycle', value as ThreatLifecycleFilter)}
                    triggerTestId="threats-status-filter-trigger"
                    contentTestId="threats-status-filter-content"
                    optionTestIdPrefix="threats-status-filter-option"
                    options={[
                        { value: 'active', label: t('register.lifecycle.active') },
                        { value: 'archived', label: t('register.lifecycle.archived') },
                        { value: 'all', label: t('register.lifecycle.all') },
                    ].map((option) => ({
                        ...option,
                        disabled: option.value === 'all'
                            ? false
                            : Boolean(lifecycleFacets.get(option.value)?.disabled && filters.lifecycle !== option.value),
                    }))}
                />
            )}
            onAddFilter={(key) => setActiveKeys((current) => [...new Set([...current, key as ThreatFilterKey])])}
            onClearAll={() => {
                setActiveKeys([]);
                onClearAll();
            }}
            onRefresh={onRefresh}
            onRemoveFilter={removeFilter}
            onSearchChange={onSearchChange}
            refreshLabel={t('common:actions.refresh')}
            removeFilterLabel={(label) => t('register.filters.remove', { label })}
            search={search}
            searchPlaceholder={t('filters.search_placeholder')}
            testIdPrefix="threats"
        >
            {activeKeys.map((key) => {
                const definition = THREAT_REGISTER_CONFIG.filters.find((candidate) => candidate.key === key);
                if (!definition) return null;
                return (
                    <div key={key} className="relative rounded-xl border border-white/10 bg-white/[0.025] p-3">
                        <button
                            type="button"
                            onClick={() => removeFilter(key)}
                            aria-label={t('register.filters.remove', { label: labels[key] })}
                            className="absolute right-2 top-2 rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        {renderControl(definition)}
                    </div>
                );
            })}
        </RegisterListToolbar>
    );
}
