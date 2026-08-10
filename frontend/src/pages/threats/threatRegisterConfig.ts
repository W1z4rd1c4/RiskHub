import type { ThreatListParams, ThreatSortField } from '@/types/threat';

import type { RegisterFilters, RegisterSortState } from '../shared/registerListQuery';

export type ThreatRegisterView = 'all' | 'category' | 'threat_steward' | 'relevant_subject' | 'linked_risk';
export type ThreatLifecycleFilter = 'active' | 'archived' | 'all';
export type ThreatFilterKey =
    | 'categories'
    | 'steward_ids'
    | 'relevant_subjects'
    | 'has_linked_risk'
    | 'linked_risk_ids'
    | 'linked_risk_types'
    | 'linked_risk_department_ids';

export interface ThreatRegisterFilters {
    lifecycle: ThreatLifecycleFilter;
    categories: string[];
    steward_ids: number[];
    relevant_subjects: string[];
    has_linked_risk: boolean | null;
    linked_risk_ids: number[];
    linked_risk_types: string[];
    linked_risk_department_ids: number[];
}

export interface ThreatRegisterFilterDefinition {
    key: ThreatFilterKey;
    kind: 'facet' | 'boolean' | 'remote';
    labelKey: string;
    lookup?: 'stewards' | 'risks' | 'risk-departments';
}

export const THREAT_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'register.views.all', groupBy: null },
        { value: 'category', labelKey: 'register.views.category', groupBy: 'category' },
        { value: 'threat_steward', labelKey: 'register.views.threat_steward', groupBy: 'threat_steward' },
        { value: 'relevant_subject', labelKey: 'register.views.relevant_subject', groupBy: 'relevant_subject' },
        { value: 'linked_risk', labelKey: 'register.views.linked_risk', groupBy: 'linked_risk' },
    ] as const,
    filters: [
        { key: 'categories', kind: 'facet', labelKey: 'register.filters.category' },
        { key: 'steward_ids', kind: 'remote', labelKey: 'register.filters.threat_steward', lookup: 'stewards' },
        { key: 'relevant_subjects', kind: 'facet', labelKey: 'register.filters.relevant_subject' },
        { key: 'has_linked_risk', kind: 'boolean', labelKey: 'register.filters.has_linked_risk' },
        { key: 'linked_risk_ids', kind: 'remote', labelKey: 'register.filters.linked_risk', lookup: 'risks' },
        { key: 'linked_risk_types', kind: 'facet', labelKey: 'register.filters.linked_risk_type' },
        { key: 'linked_risk_department_ids', kind: 'remote', labelKey: 'register.filters.linked_risk_department', lookup: 'risk-departments' },
    ] as readonly ThreatRegisterFilterDefinition[],
};

export const EMPTY_THREAT_REGISTER_FILTERS: ThreatRegisterFilters = {
    lifecycle: 'active',
    categories: [],
    steward_ids: [],
    relevant_subjects: [],
    has_linked_risk: null,
    linked_risk_ids: [],
    linked_risk_types: [],
    linked_risk_department_ids: [],
};

const numbers = (value: unknown): number[] => Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];
const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

export function parseThreatRegisterFilters(filters: RegisterFilters): ThreatRegisterFilters {
    const lifecycle = filters.lifecycle;
    return {
        lifecycle: lifecycle === 'archived' || lifecycle === 'all' ? lifecycle : 'active',
        categories: strings(filters.categories),
        steward_ids: numbers(filters.steward_ids),
        relevant_subjects: strings(filters.relevant_subjects),
        has_linked_risk: typeof filters.has_linked_risk === 'boolean' ? filters.has_linked_risk : null,
        linked_risk_ids: numbers(filters.linked_risk_ids),
        linked_risk_types: strings(filters.linked_risk_types),
        linked_risk_department_ids: numbers(filters.linked_risk_department_ids),
    };
}

export function serializeThreatRegisterFilters(filters: ThreatRegisterFilters): RegisterFilters {
    const { lifecycle, ...rest } = filters;
    return lifecycle === 'active' ? rest : { ...rest, lifecycle };
}

export function threatGroupBy(view: ThreatRegisterView): ThreatListParams['group_by'] {
    return THREAT_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

interface BuildThreatRegisterListParamsOptions {
    currentPage: number;
    filters: ThreatRegisterFilters;
    groupValue: string | null;
    limit: number;
    search: string;
    sort: RegisterSortState | null;
    view: ThreatRegisterView;
}

export function buildThreatRegisterListParams({
    currentPage,
    filters,
    groupValue,
    limit,
    search,
    sort,
    view,
}: BuildThreatRegisterListParamsOptions): ThreatListParams {
    return {
        offset: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        include_archived: filters.lifecycle === 'all',
        lifecycle: filters.lifecycle === 'all' ? ['active', 'archived'] : [filters.lifecycle],
        sort_by: sort?.field as ThreatSortField | undefined,
        sort_order: sort?.direction,
        sort: sort ?? undefined,
        view,
        group_by: threatGroupBy(view),
        group_value: groupValue ?? undefined,
        categories: filters.categories,
        steward_ids: filters.steward_ids,
        relevant_subjects: filters.relevant_subjects,
        has_linked_risk: filters.has_linked_risk ?? undefined,
        linked_risk_ids: filters.linked_risk_ids,
        linked_risk_types: filters.linked_risk_types,
        linked_risk_department_ids: filters.linked_risk_department_ids,
    };
}
