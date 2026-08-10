import type {
    KRIFrequency,
    KRILifecycle,
    KRIListParams,
    KRIMonitoringStatus,
    KRITimelinessStatus,
} from '@/types/kri';

import type { RegisterFilters, RegisterSortState } from '../shared/registerListQuery';

export type KriRegisterView = 'all' | 'category' | 'department' | 'process' | 'risk_type' | 'risk' | 'vendor';

export interface KriRegisterFilters {
    lifecycle: KRILifecycle;
    monitoring_status: KRIMonitoringStatus | '';
    timeliness_status: KRITimelinessStatus | '';
    breach_only: boolean;
    frequency: KRIFrequency | '';
    department_id: number | null;
    reporting_owner_id: number | null;
}

export const KRI_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'common:views.all', groupBy: null },
        { value: 'category', labelKey: 'common:views.by_category', groupBy: 'category' },
        { value: 'department', labelKey: 'common:views.by_department', groupBy: 'department' },
        { value: 'process', labelKey: 'common:views.by_process', groupBy: 'process' },
        { value: 'risk_type', labelKey: 'common:views.by_risk_type', groupBy: 'risk_type' },
        { value: 'risk', labelKey: 'common:views.by_risk', groupBy: 'risk' },
        { value: 'vendor', labelKey: 'common:views.by_vendor', groupBy: 'vendor' },
    ] as const,
};

export const EMPTY_KRI_REGISTER_FILTERS: KriRegisterFilters = {
    lifecycle: 'active',
    monitoring_status: '',
    timeliness_status: '',
    breach_only: false,
    frequency: '',
    department_id: null,
    reporting_owner_id: null,
};

const MONITORING = ['new', 'not_submitted', 'breach', 'warning', 'optimal'] as const;
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'annually'] as const;

export function parseKriRegisterFilters(filters: RegisterFilters): KriRegisterFilters {
    const lifecycle = filters.lifecycle;
    const monitoring = filters.monitoring_status;
    const frequency = filters.frequency;
    const breachOnly = filters.breach_only === true;
    return {
        lifecycle: breachOnly
            ? 'active'
            : lifecycle === 'archived' || lifecycle === 'all' ? lifecycle : 'active',
        monitoring_status: MONITORING.includes(monitoring as typeof MONITORING[number])
            ? monitoring as KRIMonitoringStatus
            : '',
        timeliness_status: filters.timeliness_status === 'due_soon' ? 'due_soon' : '',
        breach_only: breachOnly,
        frequency: FREQUENCIES.includes(frequency as typeof FREQUENCIES[number])
            ? frequency as KRIFrequency
            : '',
        department_id: typeof filters.department_id === 'number' ? filters.department_id : null,
        reporting_owner_id: typeof filters.reporting_owner_id === 'number' ? filters.reporting_owner_id : null,
    };
}

export function serializeKriRegisterFilters(filters: KriRegisterFilters): RegisterFilters {
    const lifecycle = filters.breach_only ? 'active' : filters.lifecycle;
    return {
        lifecycle: lifecycle === 'active' ? undefined : lifecycle,
        monitoring_status: filters.monitoring_status || undefined,
        timeliness_status: filters.timeliness_status || undefined,
        breach_only: filters.breach_only || undefined,
        frequency: filters.frequency || undefined,
        department_id: filters.department_id,
        reporting_owner_id: filters.reporting_owner_id,
    };
}

export function kriGroupBy(view: KriRegisterView): string | undefined {
    return KRI_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

export function buildKriRegisterListParams({
    currentPage,
    filters,
    groupValue,
    limit,
    search,
    sort,
    view,
}: {
    currentPage: number;
    filters: KriRegisterFilters;
    groupValue: string | null;
    limit: number;
    search: string;
    sort: RegisterSortState | null;
    view: KriRegisterView;
}): KRIListParams {
    const lifecycle = filters.breach_only ? 'active' : filters.lifecycle;
    return {
        offset: (currentPage - 1) * limit,
        limit,
        lifecycle,
        is_archived: lifecycle === 'archived' ? true : undefined,
        include_archived: lifecycle === 'all' ? true : undefined,
        search: search.trim() || undefined,
        monitoring_status: filters.monitoring_status || undefined,
        timeliness_status: filters.timeliness_status || undefined,
        breach_only: filters.breach_only || undefined,
        frequency: filters.frequency || undefined,
        department_id: filters.department_id ?? undefined,
        reporting_owner_id: filters.reporting_owner_id ?? undefined,
        sort: sort ?? undefined,
        sort_by: sort?.field,
        sort_order: sort?.direction,
        group_by: kriGroupBy(view),
        group_value: groupValue ?? undefined,
    };
}
