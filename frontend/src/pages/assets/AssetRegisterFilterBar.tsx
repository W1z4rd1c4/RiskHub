import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { RegisterListToolbar, type RegisterFilterChip } from '@/components/ict-register/RegisterListToolbar';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { assetApi } from '@/services/assetApi';
import type { AssetFacetOption, AssetFacets, AssetLookupOption } from '@/types/asset';

import {
    ASSET_REGISTER_CONFIG,
    type AssetFilterKey,
    type AssetLifecycleFilter,
    type AssetRegisterFilterDefinition,
    type AssetRegisterFilters,
} from './assetRegisterConfig';

const FACET_KEYS: Partial<Record<AssetFilterKey, keyof AssetFacets>> = {
    asset_types: 'asset_type', asset_levels: 'asset_level', deployment_models: 'deployment_model',
    criticality: 'criticality', gdpr_relevance: 'gdpr_relevance', ai_relevance: 'ai_relevance',
    data_classification: 'data_classification', lifecycle_states: 'lifecycle_state', cif: 'cif',
    legacy: 'legacy', spof: 'spof', external_dependency: 'external_dependency',
    internet_exposed: 'internet_exposed', is_complete: 'is_complete',
};

const VALUE_TRANSLATIONS: Partial<Record<AssetFilterKey, string>> = {
    asset_types: 'asset_type', asset_levels: 'asset_level', deployment_models: 'deployment_model',
    criticality: 'preliminary_criticality', gdpr_relevance: 'gdpr_relevance', ai_relevance: 'ai_relevance',
    data_classification: 'data_classification', lifecycle_states: 'lifecycle_state',
};

function hasValue(filters: AssetRegisterFilters, key: AssetFilterKey): boolean {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'boolean';
}

function emptyValue(key: AssetFilterKey): AssetRegisterFilters[AssetFilterKey] {
    return ['cif', 'legacy', 'spof', 'external_dependency', 'internet_exposed', 'is_complete'].includes(key) ? null : [];
}

interface RemoteProps {
    definition: AssetRegisterFilterDefinition;
    label: string;
    onChange: (value: number[]) => void;
    selectedIds: number[];
}

function RemoteMultiFilter({ definition, label, onChange, selectedIds }: RemoteProps) {
    const { t } = useTranslation('assets');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 250);
    const [options, setOptions] = useState<AssetLookupOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!definition.lookup) return;
        let active = true;
        setIsLoading(true);
        void assetApi.getLookupOptions(definition.lookup, {
            search: debouncedSearch.trim() || undefined,
            selectedIds,
        }).then((result) => { if (active) setOptions(result); })
            .catch(() => { if (active) setOptions([]); })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [debouncedSearch, definition.lookup, selectedIds]);

    return (
        <fieldset className="space-y-2" data-testid={`assets-filter-control-${definition.key}`}>
            <legend className="text-xs font-bold text-slate-300">{label}</legend>
            <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('register.filters.search_options')}
                aria-label={t('register.filters.search_options_for', { label })}
                data-testid={`assets-filter-${definition.key}-search`}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
            />
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-white/5 p-2" aria-busy={isLoading}>
                {options.map((option) => {
                    const checked = selectedIds.includes(option.id);
                    return (
                        <label key={option.id} className="flex items-start gap-2 rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                            <input type="checkbox" checked={checked} disabled={option.disabled && !checked}
                                data-testid={`assets-filter-${definition.key}-option-${option.id}`}
                                onChange={() => onChange(checked ? selectedIds.filter((id) => id !== option.id) : [...selectedIds, option.id])}
                                className="mt-0.5 accent-accent" />
                            <span className="min-w-0"><span className="block truncate">{option.label}</span>
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

function FacetMultiFilter({ definition, label, onChange, options, selected }: {
    definition: AssetRegisterFilterDefinition; label: string; onChange: (value: string[]) => void;
    options: AssetFacetOption[]; selected: string[];
}) {
    return (
        <fieldset className="space-y-2" data-testid={`assets-filter-control-${definition.key}`}>
            <legend className="text-xs font-bold text-slate-300">{label}</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/5 p-2">
                {options.map((option) => {
                    const checked = selected.includes(option.value);
                    return <label key={option.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                        <span className="flex items-center gap-2"><input type="checkbox" checked={checked} disabled={option.disabled && !checked}
                            onChange={() => onChange(checked ? selected.filter((value) => value !== option.value) : [...selected, option.value])}
                            className="accent-accent" />{option.label}</span>
                        <span className="tabular-nums text-slate-500">{option.count}</span>
                    </label>;
                })}
            </div>
        </fieldset>
    );
}

interface Props {
    facets: AssetFacets; filters: AssetRegisterFilters; isLifecycleLocked?: boolean; isLoading: boolean; onClearAll: () => void;
    onFilterChange: <K extends keyof AssetRegisterFilters>(key: K, value: AssetRegisterFilters[K]) => void;
    onRefresh: () => void; onSearchChange: (value: string) => void; search: string;
}

export function AssetRegisterFilterBar({ facets, filters, isLifecycleLocked = false, isLoading, onClearAll, onFilterChange, onRefresh, onSearchChange, search }: Props) {
    const { t } = useTranslation(['assets', 'common']);
    const selectedFromUrl = useMemo(() => ASSET_REGISTER_CONFIG.filters.filter(({ key }) => hasValue(filters, key)).map(({ key }) => key), [filters]);
    const [activeKeys, setActiveKeys] = useState<AssetFilterKey[]>(selectedFromUrl);
    useEffect(() => setActiveKeys((current) => [...new Set([...current, ...selectedFromUrl])]), [selectedFromUrl]);
    const labels = useMemo(() => Object.fromEntries(ASSET_REGISTER_CONFIG.filters.map((definition) => [definition.key, t(definition.labelKey)])) as Record<AssetFilterKey, string>, [t]);
    const chips = useMemo<RegisterFilterChip[]>(() => [
        ...(filters.lifecycle !== 'active' ? [{ key: 'lifecycle', label: `${t('register.filters.lifecycle')}: ${t(`register.lifecycle.${filters.lifecycle}`)}` }] : []),
        ...ASSET_REGISTER_CONFIG.filters.filter(({ key }) => hasValue(filters, key)).map(({ key }) => ({ key, label: labels[key] })),
    ], [filters, labels, t]);

    const removeFilter = (key: string) => {
        if (key === 'lifecycle') return onFilterChange('lifecycle', 'active');
        const typedKey = key as AssetFilterKey;
        onFilterChange(typedKey, emptyValue(typedKey));
        setActiveKeys((current) => current.filter((item) => item !== typedKey));
    };
    const renderControl = (definition: AssetRegisterFilterDefinition) => {
        const label = labels[definition.key];
        if (definition.kind === 'remote') return <RemoteMultiFilter key={definition.key} definition={definition} label={label} selectedIds={filters[definition.key] as number[]} onChange={(value) => onFilterChange(definition.key, value)} />;
        if (definition.kind === 'facet') {
            const translation = VALUE_TRANSLATIONS[definition.key];
            const options = (facets[FACET_KEYS[definition.key] ?? 'asset_type'] ?? []).map((option) => translation
                ? { ...option, label: t(`values.${translation}.${option.value}`, t('values.unknown')) }
                : option);
            return <FacetMultiFilter key={definition.key} definition={definition} label={label} options={options} selected={filters[definition.key] as string[]} onChange={(value) => onFilterChange(definition.key, value)} />;
        }
        const current = filters[definition.key] as boolean | null;
        const facetOptions = facets[FACET_KEYS[definition.key] ?? 'cif'] ?? [];
        const trueCode = definition.key === 'is_complete' ? 'true' : 'yes';
        const falseCode = definition.key === 'is_complete' ? 'false' : 'no';
        const trueFacet = facetOptions.find((option) => option.value === trueCode);
        const falseFacet = facetOptions.find((option) => option.value === falseCode);
        const optionLabel = (translationKey: string, option: AssetFacetOption | undefined) => (
            option ? `${t(translationKey)} (${option.count})` : t(translationKey)
        );
        return <label key={definition.key} className="space-y-2 text-xs font-bold text-slate-300" data-testid={`assets-filter-control-${definition.key}`}>
            <span>{label}</span><select value={current === null ? '' : String(current)} onChange={(event) => onFilterChange(definition.key, event.target.value === '' ? null : event.target.value === 'true')} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value="">{t('register.boolean.any')}</option>
                <option value="true" disabled={Boolean(trueFacet?.disabled && current !== true)}>{optionLabel('register.boolean.yes', trueFacet)}</option>
                <option value="false" disabled={Boolean(falseFacet?.disabled && current !== false)}>{optionLabel('register.boolean.no', falseFacet)}</option>
            </select>
        </label>;
    };

    return <RegisterListToolbar activeFilterCount={chips.length}
        availableFilters={ASSET_REGISTER_CONFIG.filters.filter(({ key }) => !activeKeys.includes(key)).map(({ key }) => ({ value: key, label: labels[key] }))}
        chips={chips} clearAllLabel={t('register.filters.clear_all')} filterCountLabel={t('register.filters.active_count', { count: chips.length })}
        filtersLabel={t('register.filters.add')} isLoading={isLoading}
        lifecycleControl={<ThemedSelect value={isLifecycleLocked ? 'all' : filters.lifecycle} disabled={isLifecycleLocked} onValueChange={(value) => onFilterChange('lifecycle', value as AssetLifecycleFilter)} triggerAriaLabel={t('register.filters.lifecycle')} triggerTestId="assets-status-filter-trigger" contentTestId="assets-status-filter-content" optionTestIdPrefix="assets-status-filter-option"
            options={['active', 'archived', 'all'].map((value) => ({ value, label: t(`register.lifecycle.${value}`), disabled: value === 'all' ? false : Boolean(facets.lifecycle?.find((item) => item.value === value)?.disabled && filters.lifecycle !== value) }))} />}
        onAddFilter={(key) => setActiveKeys((current) => [...new Set([...current, key as AssetFilterKey])])}
        onClearAll={() => { setActiveKeys([]); onClearAll(); }} onRefresh={onRefresh} onRemoveFilter={removeFilter}
        onSearchChange={onSearchChange} refreshLabel={t('common:actions.refresh')} removeFilterLabel={(label) => t('register.filters.remove', { label })}
        search={search} searchPlaceholder={t('filters.search_placeholder')} testIdPrefix="assets">
        {activeKeys.map((key) => {
            const definition = ASSET_REGISTER_CONFIG.filters.find((item) => item.key === key);
            return definition ? <div key={key} className="relative rounded-xl border border-white/10 bg-white/[0.025] p-3 pr-12">
                <Button variant="secondary" size="iconCompact" onClick={() => removeFilter(key)} aria-label={t('register.filters.remove', { label: labels[key] })} className="absolute right-2 top-2"><X aria-hidden="true" /></Button>
                {renderControl(definition)}
            </div> : null;
        })}
    </RegisterListToolbar>;
}
