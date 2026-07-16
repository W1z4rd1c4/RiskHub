import type { ControlListParams, ControlMonitoringStatus, ControlStatus } from '@/types/control';

import type { RegisterFilters, RegisterSortState } from '../shared/registerListQuery';

export type ControlRegisterView = 'all' | 'category' | 'department' | 'process' | 'risk_type' | 'risk' | 'vendor';
export type ControlLifecycleFilter = 'active' | 'archived' | 'all';

export interface ControlRegisterFilters {
    lifecycle: ControlLifecycleFilter;
    monitoring_status: ControlMonitoringStatus | '';
    status: ControlStatus | '';
    process: string;
    category: string;
}

export const CONTROL_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'register.views.all', groupBy: null },
        { value: 'category', labelKey: 'register.views.category', groupBy: 'category' },
        { value: 'department', labelKey: 'register.views.department', groupBy: 'department' },
        { value: 'process', labelKey: 'register.views.process', groupBy: 'process' },
        { value: 'risk_type', labelKey: 'register.views.risk_type', groupBy: 'risk_type' },
        { value: 'risk', labelKey: 'register.views.risk', groupBy: 'risk' },
        { value: 'vendor', labelKey: 'register.views.vendor', groupBy: 'vendor' },
    ] as const,
};

export const EMPTY_CONTROL_REGISTER_FILTERS: ControlRegisterFilters = {
    lifecycle: 'active',
    monitoring_status: '',
    status: '',
    process: '',
    category: '',
};

export function parseControlRegisterFilters(filters: RegisterFilters): ControlRegisterFilters {
    const lifecycle = filters.lifecycle;
    const monitoring = filters.monitoring_status;
    const status = filters.status;
    return {
        lifecycle: lifecycle === 'archived' || lifecycle === 'all' ? lifecycle : 'active',
        monitoring_status: ['new', 'needs_review', 'failed', 'passed'].includes(String(monitoring))
            ? monitoring as ControlMonitoringStatus
            : '',
        status: status === 'draft' || status === 'active' || status === 'inactive' ? status : '',
        process: typeof filters.process === 'string' ? filters.process : '',
        category: typeof filters.category === 'string' ? filters.category : '',
    };
}

export function serializeControlRegisterFilters(filters: ControlRegisterFilters): RegisterFilters {
    return {
        lifecycle: filters.lifecycle === 'active' ? undefined : filters.lifecycle,
        monitoring_status: filters.monitoring_status || undefined,
        status: filters.status || undefined,
        process: filters.process || undefined,
        category: filters.category || undefined,
    };
}

export function controlGroupBy(view: ControlRegisterView): ControlListParams['group_by'] {
    return CONTROL_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

export function buildControlRegisterListParams({
    currentPage,
    filters,
    groupValue,
    limit,
    search,
    sort,
    view,
}: {
    currentPage: number;
    filters: ControlRegisterFilters;
    groupValue: string | null;
    limit: number;
    search: string;
    sort: RegisterSortState | null;
    view: ControlRegisterView;
}): ControlListParams {
    return {
        offset: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        lifecycle: filters.lifecycle,
        status: filters.status || undefined,
        monitoring_status: filters.monitoring_status || undefined,
        process: filters.process || undefined,
        category: filters.category || undefined,
        sort: sort ?? undefined,
        sort_by: sort?.field,
        sort_order: sort?.direction,
        view,
        group_by: controlGroupBy(view),
        group_value: groupValue ?? undefined,
    };
}
