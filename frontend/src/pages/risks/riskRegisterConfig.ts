import type { RiskListParams, RiskStatus } from '@/types/risk';

import type { RegisterFilters, RegisterSortState } from '../shared/registerListQuery';

export type RiskRegisterView = 'all' | 'category' | 'department' | 'process' | 'risk_type' | 'vendor';
export type RiskLifecycleFilter = 'active' | 'archived' | 'all';

const BUILT_IN_RISK_TYPE_CODES = new Set([
    'operational',
    'financial',
    'strategic',
    'compliance',
    'reputational',
]);

export function resolveRiskTypeDisplayName(
    code: string,
    configuredDisplayName: string | undefined,
    translate: (key: string, fallback: string) => string,
): string {
    const fallback = configuredDisplayName?.trim() || code;
    return BUILT_IN_RISK_TYPE_CODES.has(code)
        ? translate(`categories.${code}`, fallback)
        : fallback;
}

export interface RiskRegisterFilters {
    lifecycle: RiskLifecycleFilter;
    status: RiskStatus | '';
    risk_type: string;
    is_priority: boolean | null;
    has_breach: boolean | null;
    critical: boolean;
    net_band: string;
}

export const RISK_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'register.views.all', groupBy: null },
        { value: 'category', labelKey: 'register.views.category', groupBy: 'category' },
        { value: 'department', labelKey: 'register.views.department', groupBy: 'department' },
        { value: 'process', labelKey: 'register.views.process', groupBy: 'process' },
        { value: 'risk_type', labelKey: 'register.views.risk_type', groupBy: 'risk_type' },
        { value: 'vendor', labelKey: 'register.views.vendor', groupBy: 'vendor' },
    ] as const,
};

export const EMPTY_RISK_REGISTER_FILTERS: RiskRegisterFilters = {
    lifecycle: 'active',
    status: 'active',
    risk_type: '',
    is_priority: null,
    has_breach: null,
    critical: false,
    net_band: '',
};

const booleanOrNull = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;

export function parseRiskRegisterFilters(filters: RegisterFilters): RiskRegisterFilters {
    const lifecycle = filters.lifecycle;
    const status = filters.status;
    return {
        lifecycle: lifecycle === 'archived' || lifecycle === 'all' ? lifecycle : 'active',
        status: status === 'emerging' ? 'emerging' : status === '' ? '' : 'active',
        risk_type: typeof filters.risk_type === 'string' ? filters.risk_type : '',
        is_priority: booleanOrNull(filters.is_priority),
        has_breach: booleanOrNull(filters.has_breach),
        critical: filters.critical === true,
        net_band: typeof filters.net_band === 'string' ? filters.net_band : '',
    };
}

export function serializeRiskRegisterFilters(filters: RiskRegisterFilters): RegisterFilters {
    return {
        lifecycle: filters.lifecycle === 'active' ? undefined : filters.lifecycle,
        status: filters.status === 'active' ? undefined : filters.status,
        risk_type: filters.risk_type || undefined,
        is_priority: filters.is_priority,
        has_breach: filters.has_breach,
        critical: filters.critical || undefined,
        net_band: filters.net_band || undefined,
    };
}

export function riskGroupBy(view: RiskRegisterView): RiskListParams['group_by'] {
    return RISK_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

export function buildRiskRegisterListParams({
    criticalMinNetScore,
    currentPage,
    filters,
    groupValue,
    limit,
    search,
    sort,
    view,
}: {
    criticalMinNetScore: number;
    currentPage: number;
    filters: RiskRegisterFilters;
    groupValue: string | null;
    limit: number;
    search: string;
    sort: RegisterSortState | null;
    view: RiskRegisterView;
}): RiskListParams {
    return {
        offset: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        lifecycle: filters.lifecycle,
        status: filters.status || undefined,
        risk_type: filters.risk_type || undefined,
        is_priority: filters.is_priority ?? undefined,
        has_breach: filters.has_breach ?? undefined,
        min_net_score: filters.critical ? criticalMinNetScore : undefined,
        net_band: filters.net_band || undefined,
        sort: sort ?? undefined,
        sort_by: sort?.field,
        sort_order: sort?.direction,
        view,
        group_by: riskGroupBy(view),
        group_value: groupValue ?? undefined,
    };
}
