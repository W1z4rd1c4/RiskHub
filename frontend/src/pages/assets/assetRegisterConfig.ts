import type { AssetListParams, AssetSortField } from '@/types/asset';

import type { RegisterFilters, RegisterSortState } from '../shared/registerListQuery';

export type AssetRegisterView = 'all' | 'department' | 'business_owner' | 'type' | 'criticality' | 'process' | 'vendor';
export type AssetLifecycleFilter = 'active' | 'archived' | 'all';
export type AssetFilterKey =
    | 'department_ids'
    | 'business_owner_ids'
    | 'ict_owner_ids'
    | 'asset_types'
    | 'asset_levels'
    | 'deployment_models'
    | 'criticality'
    | 'cif'
    | 'legacy'
    | 'spof'
    | 'external_dependency'
    | 'gdpr_relevance'
    | 'ai_relevance'
    | 'internet_exposed'
    | 'data_classification'
    | 'is_complete'
    | 'lifecycle_states'
    | 'linked_process_ids'
    | 'linked_asset_ids'
    | 'linked_vendor_ids'
    | 'linked_risk_ids';

export interface AssetRegisterFilters {
    lifecycle: AssetLifecycleFilter;
    department_ids: number[];
    business_owner_ids: number[];
    ict_owner_ids: number[];
    asset_types: string[];
    asset_levels: string[];
    deployment_models: string[];
    criticality: string[];
    cif: boolean | null;
    legacy: boolean | null;
    spof: boolean | null;
    external_dependency: boolean | null;
    gdpr_relevance: string[];
    ai_relevance: string[];
    internet_exposed: boolean | null;
    data_classification: string[];
    is_complete: boolean | null;
    lifecycle_states: string[];
    linked_process_ids: number[];
    linked_asset_ids: number[];
    linked_vendor_ids: number[];
    linked_risk_ids: number[];
}

export interface AssetRegisterFilterDefinition {
    key: AssetFilterKey;
    kind: 'facet' | 'boolean' | 'remote';
    labelKey: string;
    lookup?: 'business-owners' | 'ict-owners' | 'departments' | 'processes' | 'assets' | 'vendors' | 'risks';
}

export const ASSET_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'register.views.all', groupBy: null },
        { value: 'department', labelKey: 'register.views.department', groupBy: 'department' },
        { value: 'business_owner', labelKey: 'register.views.business_owner', groupBy: 'business_owner' },
        { value: 'type', labelKey: 'register.views.type', groupBy: 'type' },
        { value: 'criticality', labelKey: 'register.views.criticality', groupBy: 'criticality' },
        { value: 'process', labelKey: 'register.views.process', groupBy: 'process' },
        { value: 'vendor', labelKey: 'register.views.vendor', groupBy: 'vendor' },
    ] as const,
    filters: [
        { key: 'department_ids', kind: 'remote', labelKey: 'register.filters.department', lookup: 'departments' },
        { key: 'business_owner_ids', kind: 'remote', labelKey: 'register.filters.business_owner', lookup: 'business-owners' },
        { key: 'ict_owner_ids', kind: 'remote', labelKey: 'register.filters.ict_owner', lookup: 'ict-owners' },
        { key: 'asset_types', kind: 'facet', labelKey: 'register.filters.asset_type' },
        { key: 'asset_levels', kind: 'facet', labelKey: 'register.filters.asset_level' },
        { key: 'deployment_models', kind: 'facet', labelKey: 'register.filters.deployment_model' },
        { key: 'criticality', kind: 'facet', labelKey: 'register.filters.criticality' },
        { key: 'cif', kind: 'boolean', labelKey: 'register.filters.cif' },
        { key: 'legacy', kind: 'boolean', labelKey: 'register.filters.legacy' },
        { key: 'spof', kind: 'boolean', labelKey: 'register.filters.spof' },
        { key: 'external_dependency', kind: 'boolean', labelKey: 'register.filters.external_dependency' },
        { key: 'gdpr_relevance', kind: 'facet', labelKey: 'register.filters.gdpr_relevance' },
        { key: 'ai_relevance', kind: 'facet', labelKey: 'register.filters.ai_relevance' },
        { key: 'internet_exposed', kind: 'boolean', labelKey: 'register.filters.internet_exposed' },
        { key: 'data_classification', kind: 'facet', labelKey: 'register.filters.data_classification' },
        { key: 'is_complete', kind: 'boolean', labelKey: 'register.filters.completeness' },
        { key: 'lifecycle_states', kind: 'facet', labelKey: 'register.filters.lifecycle_state' },
        { key: 'linked_process_ids', kind: 'remote', labelKey: 'register.filters.linked_process', lookup: 'processes' },
        { key: 'linked_asset_ids', kind: 'remote', labelKey: 'register.filters.linked_asset', lookup: 'assets' },
        { key: 'linked_vendor_ids', kind: 'remote', labelKey: 'register.filters.linked_vendor', lookup: 'vendors' },
        { key: 'linked_risk_ids', kind: 'remote', labelKey: 'register.filters.linked_risk', lookup: 'risks' },
    ] as readonly AssetRegisterFilterDefinition[],
};

export const EMPTY_ASSET_REGISTER_FILTERS: AssetRegisterFilters = {
    lifecycle: 'active', department_ids: [], business_owner_ids: [], ict_owner_ids: [], asset_types: [],
    asset_levels: [], deployment_models: [], criticality: [], cif: null, legacy: null, spof: null,
    external_dependency: null, gdpr_relevance: [], ai_relevance: [], internet_exposed: null,
    data_classification: [], is_complete: null, lifecycle_states: [], linked_process_ids: [],
    linked_asset_ids: [], linked_vendor_ids: [], linked_risk_ids: [],
};

const numbers = (value: unknown): number[] => Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const bool = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;

export function parseAssetRegisterFilters(filters: RegisterFilters): AssetRegisterFilters {
    const lifecycle = filters.lifecycle;
    return {
        lifecycle: lifecycle === 'archived' || lifecycle === 'all' ? lifecycle : 'active',
        department_ids: numbers(filters.department_ids), business_owner_ids: numbers(filters.business_owner_ids),
        ict_owner_ids: numbers(filters.ict_owner_ids), asset_types: strings(filters.asset_types),
        asset_levels: strings(filters.asset_levels), deployment_models: strings(filters.deployment_models),
        criticality: strings(filters.criticality), cif: bool(filters.cif), legacy: bool(filters.legacy),
        spof: bool(filters.spof), external_dependency: bool(filters.external_dependency),
        gdpr_relevance: strings(filters.gdpr_relevance), ai_relevance: strings(filters.ai_relevance),
        internet_exposed: bool(filters.internet_exposed), data_classification: strings(filters.data_classification),
        is_complete: bool(filters.is_complete), lifecycle_states: strings(filters.lifecycle_states),
        linked_process_ids: numbers(filters.linked_process_ids), linked_asset_ids: numbers(filters.linked_asset_ids),
        linked_vendor_ids: numbers(filters.linked_vendor_ids), linked_risk_ids: numbers(filters.linked_risk_ids),
    };
}

export function serializeAssetRegisterFilters(filters: AssetRegisterFilters): RegisterFilters {
    const { lifecycle, ...rest } = filters;
    return lifecycle === 'active' ? rest : { ...rest, lifecycle };
}

export function assetGroupBy(view: AssetRegisterView): AssetListParams['group_by'] {
    return ASSET_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

interface BuildOptions {
    currentPage: number; filters: AssetRegisterFilters; groupValue: string | null; limit: number;
    search: string; sort: RegisterSortState | null; view: AssetRegisterView;
}

export function buildAssetRegisterListParams({ currentPage, filters, groupValue, limit, search, sort, view }: BuildOptions): AssetListParams {
    return {
        offset: (currentPage - 1) * limit, limit, search: search.trim() || undefined,
        include_archived: filters.lifecycle === 'all',
        lifecycle: filters.lifecycle === 'all' ? ['active', 'archived'] : [filters.lifecycle],
        sort_by: sort?.field as AssetSortField | undefined, sort_order: sort?.direction, sort: sort ?? undefined,
        view, group_by: assetGroupBy(view), group_value: groupValue ?? undefined,
        department_ids: filters.department_ids, business_owner_ids: filters.business_owner_ids,
        ict_owner_ids: filters.ict_owner_ids, asset_types: filters.asset_types, asset_levels: filters.asset_levels,
        deployment_models: filters.deployment_models, criticality: filters.criticality, cif: filters.cif ?? undefined,
        legacy: filters.legacy ?? undefined, spof: filters.spof ?? undefined,
        external_dependency: filters.external_dependency ?? undefined, gdpr_relevance: filters.gdpr_relevance,
        ai_relevance: filters.ai_relevance, internet_exposed: filters.internet_exposed ?? undefined,
        data_classification: filters.data_classification, is_complete: filters.is_complete ?? undefined,
        lifecycle_states: filters.lifecycle_states, linked_process_ids: filters.linked_process_ids,
        linked_asset_ids: filters.linked_asset_ids, linked_vendor_ids: filters.linked_vendor_ids,
        linked_risk_ids: filters.linked_risk_ids,
    };
}
