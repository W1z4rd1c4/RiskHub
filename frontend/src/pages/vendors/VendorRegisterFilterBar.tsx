import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { vendorValueLabel } from '@/lib/vendorValues';
import { vendorApi } from '@/services/vendorApi';
import type { VendorFacetKey, VendorFacetOption, VendorFacets, VendorLookupOption } from '@/types/vendor';

import {
    VENDOR_REGISTER_CONFIG,
    type VendorFilterKey,
    type VendorLifecycleFilter,
    type VendorRegisterFilterDefinition,
    type VendorRegisterFilters,
} from './vendorRegisterConfig';

const FACET_KEYS: Partial<Record<VendorFilterKey, VendorFacetKey>> = {
    vendor_types: 'vendor_type',
    risk_scores: 'risk_score',
    tiers: 'tier',
    dora_relevant: 'dora_relevant',
    cif: 'cif',
    is_significant_vendor: 'is_significant_vendor',
    substitutability: 'substitutability',
    countries: 'country',
    country_categories: 'country_category',
    has_roi_contract: 'has_roi_contract',
    has_sub_outsourcing: 'has_sub_outsourcing',
    has_direct_process_link: 'has_direct_process_link',
};

const VALUE_TRANSLATIONS: Partial<Record<VendorFilterKey, string>> = {
    vendor_types: 'type',
    tiers: 'tier',
    substitutability: 'replaceability',
    countries: 'country',
    country_categories: 'country_category',
};

const hasValue = (filters: VendorRegisterFilters, key: VendorFilterKey): boolean => {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : value !== null;
};

const emptyValue = (key: VendorFilterKey): VendorRegisterFilters[VendorFilterKey] => (
    ['dora_relevant', 'cif', 'is_significant_vendor', 'has_roi_contract', 'has_sub_outsourcing', 'has_direct_process_link'].includes(key)
        ? null
        : []
);

interface RemoteProps {
    definition: VendorRegisterFilterDefinition;
    label: string;
    onChange: (value: number[]) => void;
    selectedIds: number[];
}

function RemoteMultiFilter({ definition, label, onChange, selectedIds }: RemoteProps) {
    const { t } = useTranslation('vendors');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 250);
    const [options, setOptions] = useState<VendorLookupOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!definition.lookup) return;
        let active = true;
        setIsLoading(true);
        void vendorApi.getLookupOptions(definition.lookup, {
            search: debouncedSearch.trim() || undefined,
            selectedIds,
        }).then((result) => { if (active) setOptions(result); })
            .catch(() => { if (active) setOptions([]); })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [debouncedSearch, definition.lookup, selectedIds]);

    return (
        <fieldset className="space-y-2" data-testid={`vendors-filter-control-${definition.key}`}>
            <legend className="text-xs font-bold text-slate-300">{label}</legend>
            <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('register.filters.search_options')}
                aria-label={t('register.filters.search_options_for', { label })}
                data-testid={`vendors-filter-${definition.key}-search`}
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
                                data-testid={`vendors-filter-${definition.key}-option-${option.id}`}
                                onChange={() => onChange(
                                    checked
                                        ? selectedIds.filter((id) => id !== option.id)
                                        : [...selectedIds, option.id],
                                )}
                                className="mt-0.5 accent-accent"
                            />
                            <span className="min-w-0">
                                <span className="block truncate">{option.label}</span>
                                {option.secondary_label ? <span className="block truncate text-slate-500">{option.secondary_label}</span> : null}
                            </span>
                        </label>
                    );
                })}
                {!isLoading && options.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-slate-500">{t('register.filters.no_options')}</p>
                ) : null}
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
    definition: VendorRegisterFilterDefinition;
    label: string;
    onChange: (value: string[]) => void;
    options: VendorFacetOption[];
    selected: string[];
}) {
    return (
        <fieldset className="space-y-2" data-testid={`vendors-filter-control-${definition.key}`}>
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
                                    data-testid={`vendors-filter-${definition.key}-option-${option.value}`}
                                    onChange={() => onChange(
                                        checked
                                            ? selected.filter((value) => value !== option.value)
                                            : [...selected, option.value],
                                    )}
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

interface Props {
    facets: VendorFacets;
    filters: VendorRegisterFilters;
    isLifecycleLocked?: boolean;
    isLoading: boolean;
    onClearAll: () => void;
    onFilterChange: <K extends keyof VendorRegisterFilters>(key: K, value: VendorRegisterFilters[K]) => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    search: string;
}

export function VendorRegisterFilterBar({
    facets,
    filters,
    isLifecycleLocked = false,
    isLoading,
    onClearAll,
    onFilterChange,
    onRefresh,
    onSearchChange,
    search,
}: Props) {
    const { t } = useTranslation(['vendors', 'common']);
    const selectedFromUrl = useMemo(() => VENDOR_REGISTER_CONFIG.filters
        .filter(({ key }) => hasValue(filters, key))
        .map(({ key }) => key), [filters]);
    const [activeKeys, setActiveKeys] = useState<VendorFilterKey[]>(selectedFromUrl);
    useEffect(() => setActiveKeys((current) => [...new Set([...current, ...selectedFromUrl])]), [selectedFromUrl]);
    const labels = useMemo(() => Object.fromEntries(
        VENDOR_REGISTER_CONFIG.filters.map((definition) => [definition.key, t(definition.labelKey)]),
    ) as Record<VendorFilterKey, string>, [t]);
    const chips = useMemo<RegisterFilterChip[]>(() => [
        ...(filters.lifecycle !== 'active' ? [{
            key: 'lifecycle',
            label: `${t('register.filters.lifecycle')}: ${t(`register.lifecycle.${filters.lifecycle}`)}`,
        }] : []),
        ...VENDOR_REGISTER_CONFIG.filters
            .filter(({ key }) => hasValue(filters, key))
            .map(({ key }) => ({ key, label: labels[key] })),
    ], [filters, labels, t]);

    const removeFilter = (key: string) => {
        if (key === 'lifecycle') return onFilterChange('lifecycle', 'active');
        const typedKey = key as VendorFilterKey;
        onFilterChange(typedKey, emptyValue(typedKey));
        setActiveKeys((current) => current.filter((item) => item !== typedKey));
    };

    const renderControl = (definition: VendorRegisterFilterDefinition) => {
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
            const translation = VALUE_TRANSLATIONS[definition.key];
            const facetKey = FACET_KEYS[definition.key];
            const options = (facetKey ? facets[facetKey] : [])?.map((option) => {
                if (!translation) return option;
                if (translation === 'type') {
                    return { ...option, label: t(`type.${option.value}`, t('values.unknown')) };
                }
                return { ...option, label: vendorValueLabel(t, translation, option.value) };
            }) ?? [];
            const selected = definition.key === 'risk_scores'
                ? (filters.risk_scores.map(String))
                : filters[definition.key] as string[];
            return (
                <FacetMultiFilter
                    key={definition.key}
                    definition={definition}
                    label={label}
                    options={options}
                    selected={selected}
                    onChange={(values) => {
                        if (definition.key === 'risk_scores') {
                            onFilterChange('risk_scores', values.map(Number).filter((value) => Number.isInteger(value)));
                        } else {
                            onFilterChange(definition.key, values);
                        }
                    }}
                />
            );
        }
        const current = filters[definition.key] as boolean | null;
        const facetOptions = facets[FACET_KEYS[definition.key] ?? 'dora_relevant'] ?? [];
        const trueFacet = facetOptions.find((option) => option.value === 'yes' || option.value === 'true');
        const falseFacet = facetOptions.find((option) => option.value === 'no' || option.value === 'false');
        const optionLabel = (translationKey: string, option: VendorFacetOption | undefined) => (
            option ? `${t(translationKey)} (${option.count})` : t(translationKey)
        );
        return (
            <label key={definition.key} className="space-y-2 text-xs font-bold text-slate-300" data-testid={`vendors-filter-control-${definition.key}`}>
                <span>{label}</span>
                <select
                    value={current === null ? '' : String(current)}
                    data-testid={`vendors-filter-${definition.key}-select`}
                    onChange={(event) => onFilterChange(
                        definition.key,
                        event.target.value === '' ? null : event.target.value === 'true',
                    )}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                    <option value="">{t('register.boolean.any')}</option>
                    <option value="true" disabled={Boolean(trueFacet?.disabled && current !== true)}>
                        {optionLabel('register.boolean.yes', trueFacet)}
                    </option>
                    <option value="false" disabled={Boolean(falseFacet?.disabled && current !== false)}>
                        {optionLabel('register.boolean.no', falseFacet)}
                    </option>
                </select>
            </label>
        );
    };

    return (
        <RegisterListToolbar
            activeFilterCount={chips.length}
            availableFilters={VENDOR_REGISTER_CONFIG.filters
                .filter(({ key }) => !activeKeys.includes(key))
                .map(({ key }) => ({ value: key, label: labels[key] }))}
            chips={chips}
            clearAllLabel={t('register.filters.clear_all')}
            filterCountLabel={t('register.filters.active_count', { count: chips.length })}
            filtersLabel={t('register.filters.add')}
            isLoading={isLoading}
            lifecycleControl={(
                <ThemedSelect
                    value={isLifecycleLocked ? 'all' : filters.lifecycle}
                    onValueChange={(value) => onFilterChange('lifecycle', value as VendorLifecycleFilter)}
                    disabled={isLifecycleLocked}
                    triggerTestId="vendors-status-filter-trigger"
                    contentTestId="vendors-status-filter-content"
                    optionTestIdPrefix="vendors-status-filter-option"
                    options={['active', 'archived', 'all'].map((value) => ({
                        value,
                        label: t(`register.lifecycle.${value}`),
                        disabled: value === 'all' ? false : Boolean(
                            facets.lifecycle?.find((item) => item.value === value)?.disabled
                            && filters.lifecycle !== value,
                        ),
                    }))}
                />
            )}
            onAddFilter={(key) => setActiveKeys((current) => [...new Set([...current, key as VendorFilterKey])])}
            onClearAll={() => { setActiveKeys([]); onClearAll(); }}
            onRefresh={onRefresh}
            onRemoveFilter={removeFilter}
            onSearchChange={onSearchChange}
            refreshLabel={t('common:actions.refresh')}
            removeFilterLabel={(label) => t('register.filters.remove', { label })}
            search={search}
            searchPlaceholder={t('filters.search_placeholder')}
            testIdPrefix="vendors"
        >
            {activeKeys.map((key) => {
                const definition = VENDOR_REGISTER_CONFIG.filters.find((item) => item.key === key);
                return definition ? (
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
                ) : null;
            })}
        </RegisterListToolbar>
    );
}
