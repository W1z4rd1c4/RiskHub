import type {
    VendorGroupBy,
    VendorListParams,
    VendorRegisterView,
    VendorSortField,
    VendorType,
} from '@/types/vendor';

import type { RegisterFilters, RegisterSortState } from '../shared/registerListQuery';

export type { VendorRegisterView } from '@/types/vendor';

export type VendorLifecycleFilter = 'active' | 'archived' | 'all';
export type VendorFilterKey =
    | 'department_ids'
    | 'outsourcing_owner_ids'
    | 'vendor_types'
    | 'risk_scores'
    | 'tiers'
    | 'dora_relevant'
    | 'cif'
    | 'is_significant_vendor'
    | 'substitutability'
    | 'countries'
    | 'country_categories'
    | 'has_roi_contract'
    | 'has_sub_outsourcing'
    | 'has_direct_process_link'
    | 'linked_process_ids'
    | 'linked_asset_ids'
    | 'linked_risk_ids'
    | 'linked_control_ids'
    | 'linked_kri_ids';

export interface VendorRegisterFilters {
    lifecycle: VendorLifecycleFilter;
    department_ids: number[];
    outsourcing_owner_ids: number[];
    vendor_types: VendorType[];
    risk_scores: number[];
    tiers: string[];
    dora_relevant: boolean | null;
    cif: boolean | null;
    is_significant_vendor: boolean | null;
    substitutability: string[];
    countries: string[];
    country_categories: string[];
    has_roi_contract: boolean | null;
    has_sub_outsourcing: boolean | null;
    has_direct_process_link: boolean | null;
    linked_process_ids: number[];
    linked_asset_ids: number[];
    linked_risk_ids: number[];
    linked_control_ids: number[];
    linked_kri_ids: number[];
}

export interface VendorRegisterFilterDefinition {
    key: VendorFilterKey;
    kind: 'facet' | 'boolean' | 'remote';
    labelKey: string;
    lookup?: 'outsourcing-owners' | 'departments' | 'processes' | 'assets' | 'risks' | 'controls' | 'kris';
}

export const VENDOR_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'register.views.all', groupBy: null },
        { value: 'department', labelKey: 'register.views.department', groupBy: 'department' },
        { value: 'process', labelKey: 'register.views.process', groupBy: 'process' },
        { value: 'type', labelKey: 'register.views.type', groupBy: 'type' },
        { value: 'risk', labelKey: 'register.views.risk', groupBy: 'risk' },
        { value: 'flag', labelKey: 'register.views.flag', groupBy: 'flag' },
    ] as const,
    filters: [
        { key: 'department_ids', kind: 'remote', labelKey: 'register.filters.department', lookup: 'departments' },
        { key: 'outsourcing_owner_ids', kind: 'remote', labelKey: 'register.filters.outsourcing_owner', lookup: 'outsourcing-owners' },
        { key: 'vendor_types', kind: 'facet', labelKey: 'register.filters.vendor_type' },
        { key: 'risk_scores', kind: 'facet', labelKey: 'register.filters.risk_score' },
        { key: 'tiers', kind: 'facet', labelKey: 'register.filters.tier' },
        { key: 'dora_relevant', kind: 'boolean', labelKey: 'register.filters.dora_relevant' },
        { key: 'cif', kind: 'boolean', labelKey: 'register.filters.cif' },
        { key: 'is_significant_vendor', kind: 'boolean', labelKey: 'register.filters.is_significant_vendor' },
        { key: 'substitutability', kind: 'facet', labelKey: 'register.filters.substitutability' },
        { key: 'countries', kind: 'facet', labelKey: 'register.filters.country' },
        { key: 'country_categories', kind: 'facet', labelKey: 'register.filters.country_category' },
        { key: 'has_roi_contract', kind: 'boolean', labelKey: 'register.filters.has_roi_contract' },
        { key: 'has_sub_outsourcing', kind: 'boolean', labelKey: 'register.filters.has_sub_outsourcing' },
        { key: 'has_direct_process_link', kind: 'boolean', labelKey: 'register.filters.has_direct_process_link' },
        { key: 'linked_process_ids', kind: 'remote', labelKey: 'register.filters.linked_process', lookup: 'processes' },
        { key: 'linked_asset_ids', kind: 'remote', labelKey: 'register.filters.linked_asset', lookup: 'assets' },
        { key: 'linked_risk_ids', kind: 'remote', labelKey: 'register.filters.linked_risk', lookup: 'risks' },
        { key: 'linked_control_ids', kind: 'remote', labelKey: 'register.filters.linked_control', lookup: 'controls' },
        { key: 'linked_kri_ids', kind: 'remote', labelKey: 'register.filters.linked_kri', lookup: 'kris' },
    ] as readonly VendorRegisterFilterDefinition[],
};

export const EMPTY_VENDOR_REGISTER_FILTERS: VendorRegisterFilters = {
    lifecycle: 'active',
    department_ids: [],
    outsourcing_owner_ids: [],
    vendor_types: [],
    risk_scores: [],
    tiers: [],
    dora_relevant: null,
    cif: null,
    is_significant_vendor: null,
    substitutability: [],
    countries: [],
    country_categories: [],
    has_roi_contract: null,
    has_sub_outsourcing: null,
    has_direct_process_link: null,
    linked_process_ids: [],
    linked_asset_ids: [],
    linked_risk_ids: [],
    linked_control_ids: [],
    linked_kri_ids: [],
};

const numbers = (value: unknown): number[] => Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];
const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
const bool = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;

export function parseVendorRegisterFilters(filters: RegisterFilters): VendorRegisterFilters {
    const lifecycle = filters.lifecycle;
    return {
        lifecycle: lifecycle === 'archived' || lifecycle === 'all' ? lifecycle : 'active',
        department_ids: numbers(filters.department_ids),
        outsourcing_owner_ids: numbers(filters.outsourcing_owner_ids),
        vendor_types: strings(filters.vendor_types).filter((value): value is VendorType => (
            ['ict', 'outsourcing', 'professional_services', 'partner', 'other'].includes(value)
        )),
        risk_scores: numbers(filters.risk_scores).filter((value) => value >= 1 && value <= 5),
        tiers: strings(filters.tiers),
        dora_relevant: bool(filters.dora_relevant),
        cif: bool(filters.cif),
        is_significant_vendor: bool(filters.is_significant_vendor),
        substitutability: strings(filters.substitutability),
        countries: strings(filters.countries),
        country_categories: strings(filters.country_categories),
        has_roi_contract: bool(filters.has_roi_contract),
        has_sub_outsourcing: bool(filters.has_sub_outsourcing),
        has_direct_process_link: bool(filters.has_direct_process_link),
        linked_process_ids: numbers(filters.linked_process_ids),
        linked_asset_ids: numbers(filters.linked_asset_ids),
        linked_risk_ids: numbers(filters.linked_risk_ids),
        linked_control_ids: numbers(filters.linked_control_ids),
        linked_kri_ids: numbers(filters.linked_kri_ids),
    };
}

export function serializeVendorRegisterFilters(filters: VendorRegisterFilters): RegisterFilters {
    const { lifecycle, ...rest } = filters;
    return lifecycle === 'active' ? rest : { ...rest, lifecycle };
}

export function vendorGroupBy(view: VendorRegisterView): VendorGroupBy | undefined {
    return VENDOR_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

interface BuildOptions {
    currentPage: number;
    filters: VendorRegisterFilters;
    groupValue: string | null;
    limit: number;
    search: string;
    sort: RegisterSortState | null;
    view: VendorRegisterView;
}

export function buildVendorRegisterListParams({
    currentPage,
    filters,
    groupValue,
    limit,
    search,
    sort,
    view,
}: BuildOptions): VendorListParams {
    return {
        offset: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        include_archived: filters.lifecycle === 'all',
        lifecycle: filters.lifecycle === 'all' ? ['active', 'archived'] : [filters.lifecycle],
        sort_by: sort?.field as VendorSortField | undefined,
        sort_order: sort?.direction,
        sort: sort ?? undefined,
        view,
        group_by: vendorGroupBy(view),
        group_value: groupValue ?? undefined,
        department_ids: filters.department_ids,
        outsourcing_owner_ids: filters.outsourcing_owner_ids,
        vendor_types: filters.vendor_types,
        risk_scores: filters.risk_scores,
        tiers: filters.tiers,
        dora_relevant: filters.dora_relevant ?? undefined,
        cif: filters.cif ?? undefined,
        is_significant_vendor: filters.is_significant_vendor ?? undefined,
        substitutability: filters.substitutability,
        countries: filters.countries,
        country_categories: filters.country_categories,
        has_roi_contract: filters.has_roi_contract ?? undefined,
        has_sub_outsourcing: filters.has_sub_outsourcing ?? undefined,
        has_direct_process_link: filters.has_direct_process_link ?? undefined,
        linked_process_ids: filters.linked_process_ids,
        linked_asset_ids: filters.linked_asset_ids,
        linked_risk_ids: filters.linked_risk_ids,
        linked_control_ids: filters.linked_control_ids,
        linked_kri_ids: filters.linked_kri_ids,
    };
}
