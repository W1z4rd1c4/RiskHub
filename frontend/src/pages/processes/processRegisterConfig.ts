import type { ProcessListParams, ProcessSortField } from '@/types/process';

import type { RegisterSortState } from '../shared/registerListQuery';
import type { RegisterFilters } from '../shared/registerListQuery';

export type ProcessRegisterView = 'all' | 'department' | 'owner' | 'l0' | 'criticality' | 'vendor';
export type ProcessLifecycleFilter = 'active' | 'archived' | 'all';
export type ProcessFilterKey =
    | 'department_ids'
    | 'owner_ids'
    | 'l0_areas'
    | 'criticality'
    | 'cif'
    | 'is_complete'
    | 'licensed_activity'
    | 'bcm_link'
    | 'dr_test_result'
    | 'mtpd'
    | 'linked_asset_ids'
    | 'linked_vendor_ids'
    | 'linked_risk_ids';

export interface ProcessRegisterFilters {
    lifecycle: ProcessLifecycleFilter;
    department_ids: number[];
    owner_ids: number[];
    l0_areas: string[];
    criticality: string[];
    cif: boolean | null;
    is_complete: boolean | null;
    licensed_activity: string[];
    bcm_link: string[];
    dr_test_result: string[];
    mtpd: { min?: number; max?: number };
    linked_asset_ids: number[];
    linked_vendor_ids: number[];
    linked_risk_ids: number[];
}

export interface ProcessRegisterFilterDefinition {
    key: ProcessFilterKey;
    kind: 'facet' | 'boolean' | 'range' | 'remote';
    labelKey: string;
    lookup?: 'departments' | 'owners' | 'assets' | 'vendors' | 'risks';
}

export const PROCESS_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'register.views.all', groupBy: null },
        { value: 'department', labelKey: 'register.views.department', groupBy: 'department' },
        { value: 'owner', labelKey: 'register.views.owner', groupBy: 'owner' },
        { value: 'l0', labelKey: 'register.views.l0', groupBy: 'l0' },
        { value: 'criticality', labelKey: 'register.views.criticality', groupBy: 'criticality' },
        { value: 'vendor', labelKey: 'register.views.vendor', groupBy: 'vendor' },
    ] as const,
    filters: [
        { key: 'department_ids', kind: 'remote', labelKey: 'register.filters.department', lookup: 'departments' },
        { key: 'owner_ids', kind: 'remote', labelKey: 'register.filters.owner', lookup: 'owners' },
        { key: 'l0_areas', kind: 'facet', labelKey: 'register.filters.l0' },
        { key: 'criticality', kind: 'facet', labelKey: 'register.filters.criticality' },
        { key: 'cif', kind: 'boolean', labelKey: 'register.filters.cif' },
        { key: 'is_complete', kind: 'boolean', labelKey: 'register.filters.completeness' },
        { key: 'licensed_activity', kind: 'facet', labelKey: 'register.filters.licensed_activity' },
        { key: 'bcm_link', kind: 'facet', labelKey: 'register.filters.bcm' },
        { key: 'dr_test_result', kind: 'facet', labelKey: 'register.filters.dr_result' },
        { key: 'mtpd', kind: 'range', labelKey: 'register.filters.mtpd' },
        { key: 'linked_asset_ids', kind: 'remote', labelKey: 'register.filters.linked_asset', lookup: 'assets' },
        { key: 'linked_vendor_ids', kind: 'remote', labelKey: 'register.filters.linked_vendor', lookup: 'vendors' },
        { key: 'linked_risk_ids', kind: 'remote', labelKey: 'register.filters.linked_risk', lookup: 'risks' },
    ] as readonly ProcessRegisterFilterDefinition[],
};

export const EMPTY_PROCESS_REGISTER_FILTERS: ProcessRegisterFilters = {
    lifecycle: 'active',
    department_ids: [],
    owner_ids: [],
    l0_areas: [],
    criticality: [],
    cif: null,
    is_complete: null,
    licensed_activity: [],
    bcm_link: [],
    dr_test_result: [],
    mtpd: {},
    linked_asset_ids: [],
    linked_vendor_ids: [],
    linked_risk_ids: [],
};

const arrayOfNumbers = (value: unknown): number[] => Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === 'number')
    : [];
const arrayOfStrings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
const booleanOrNull = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;

export function parseProcessRegisterFilters(filters: RegisterFilters): ProcessRegisterFilters {
    const lifecycle = filters.lifecycle;
    const range = filters.mtpd;
    return {
        lifecycle: lifecycle === 'archived' || lifecycle === 'all' ? lifecycle : 'active',
        department_ids: arrayOfNumbers(filters.department_ids),
        owner_ids: arrayOfNumbers(filters.owner_ids),
        l0_areas: arrayOfStrings(filters.l0_areas),
        criticality: arrayOfStrings(filters.criticality),
        cif: booleanOrNull(filters.cif),
        is_complete: booleanOrNull(filters.is_complete),
        licensed_activity: arrayOfStrings(filters.licensed_activity),
        bcm_link: arrayOfStrings(filters.bcm_link),
        dr_test_result: arrayOfStrings(filters.dr_test_result),
        mtpd: range && typeof range === 'object' && !Array.isArray(range) ? range : {},
        linked_asset_ids: arrayOfNumbers(filters.linked_asset_ids),
        linked_vendor_ids: arrayOfNumbers(filters.linked_vendor_ids),
        linked_risk_ids: arrayOfNumbers(filters.linked_risk_ids),
    };
}

export function serializeProcessRegisterFilters(filters: ProcessRegisterFilters): RegisterFilters {
    const { lifecycle, ...rest } = filters;
    return lifecycle === 'active' ? rest : { ...rest, lifecycle };
}

export function processGroupBy(view: ProcessRegisterView): ProcessListParams['group_by'] {
    return PROCESS_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

interface BuildProcessRegisterListParamsOptions {
    currentPage: number;
    filters: ProcessRegisterFilters;
    groupValue: string | null;
    limit: number;
    search: string;
    sort: RegisterSortState | null;
    view: ProcessRegisterView;
}

export function buildProcessRegisterListParams({
    currentPage,
    filters,
    groupValue,
    limit,
    search,
    sort,
    view,
}: BuildProcessRegisterListParamsOptions): ProcessListParams {
    const groupBy = processGroupBy(view);
    return {
        offset: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        include_archived: filters.lifecycle === 'all',
        lifecycle: filters.lifecycle === 'all' ? ['active', 'archived'] : [filters.lifecycle],
        sort_by: sort?.field as ProcessSortField | undefined,
        sort_order: sort?.direction,
        sort: sort ?? undefined,
        view,
        group_by: groupBy ?? undefined,
        group_value: groupValue ?? undefined,
        department_ids: filters.department_ids,
        owner_ids: filters.owner_ids,
        l0_areas: filters.l0_areas,
        criticality: filters.criticality,
        cif: filters.cif ?? undefined,
        is_complete: filters.is_complete ?? undefined,
        licensed_activity: filters.licensed_activity,
        bcm_link: filters.bcm_link,
        dr_test_result: filters.dr_test_result,
        mtpd_min: filters.mtpd.min,
        mtpd_max: filters.mtpd.max,
        linked_asset_ids: filters.linked_asset_ids,
        linked_vendor_ids: filters.linked_vendor_ids,
        linked_risk_ids: filters.linked_risk_ids,
    };
}
