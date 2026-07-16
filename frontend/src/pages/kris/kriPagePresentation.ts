import type { CollectionGroup } from '@/types/collection';
import type { KRIMonitoringStatus, KRITimelinessStatus } from '@/types/kri';

export type KriStatusFilter = 'all' | 'archived' | KRIMonitoringStatus;
export type KriTimelinessFilter = KRITimelinessStatus | null;

export const ARCHIVED_ROUTE_VALUE = 'archived';
export const ARCHIVED_STATUS_PARAM = 'status';
export const KRI_GROUP_UNLINKED_VENDOR = '__unlinked_vendor__';
export const KRI_GROUP_UNCATEGORIZED = '__uncategorized__';
export const KRI_GROUP_UNKNOWN_DEPARTMENT = '__unknown_department__';
export const KRI_GROUP_NO_PROCESS = '__no_process__';
export const KRI_GROUP_UNKNOWN_RISK_TYPE = '__unknown_risk_type__';
export const KRI_GROUP_UNKNOWN_RISK = '__unknown_risk__';

export function isMonitoringStatus(
    value: string | null,
    allowedValues: readonly string[]
): value is KRIMonitoringStatus {
    return value !== null && allowedValues.includes(value);
}

export function isTimelinessStatus(value: string | null, allowedValues: readonly string[]): value is KRITimelinessStatus {
    return value !== null && allowedValues.includes(value);
}

export function readKriRouteFilters(
    searchParams: URLSearchParams,
    monitoringValues: readonly string[],
    timelinessValues: readonly string[]
): {
    statusFilter: KriStatusFilter;
    timelinessFilter: KriTimelinessFilter;
} {
    const timeliness = searchParams.get('timeliness_status');
    if (isTimelinessStatus(timeliness, timelinessValues)) {
        return { statusFilter: 'all', timelinessFilter: timeliness };
    }
    const monitoringStatus = searchParams.get('monitoring_status');
    if (isMonitoringStatus(monitoringStatus, monitoringValues)) {
        return { statusFilter: monitoringStatus, timelinessFilter: null };
    }
    if (searchParams.get(ARCHIVED_STATUS_PARAM) === ARCHIVED_ROUTE_VALUE) {
        return { statusFilter: 'archived', timelinessFilter: null };
    }
    return { statusFilter: 'all', timelinessFilter: null };
}

export function buildKriExportFilters(params: {
    search: string;
    statusFilter: KriStatusFilter;
    timelinessFilter: KriTimelinessFilter;
}) {
    const search = params.search.trim() || null;

    if (params.timelinessFilter) {
        return {
            status: null,
            monitoringStatus: null,
            search,
            timelinessStatus: params.timelinessFilter,
        };
    }

    if (params.statusFilter !== 'all' && params.statusFilter !== 'archived') {
        return {
            status: null,
            monitoringStatus: params.statusFilter,
            search,
            timelinessStatus: null,
        };
    }

    return {
        status: params.statusFilter === 'archived' ? 'archived' : null,
        monitoringStatus: null,
        search,
        timelinessStatus: null,
    };
}

export function formatKriGroupLabel(group: CollectionGroup, labels: {
    unlinkedVendor: string;
    uncategorized: string;
    unknownDepartment: string;
    noProcess: string;
    unknownRiskType: string;
    unknownRisk: string;
}): string {
    switch (group.value) {
        case KRI_GROUP_UNLINKED_VENDOR:
            return labels.unlinkedVendor;
        case KRI_GROUP_UNCATEGORIZED:
            return labels.uncategorized;
        case KRI_GROUP_UNKNOWN_DEPARTMENT:
            return labels.unknownDepartment;
        case KRI_GROUP_NO_PROCESS:
            return labels.noProcess;
        case KRI_GROUP_UNKNOWN_RISK_TYPE:
            return labels.unknownRiskType;
        case KRI_GROUP_UNKNOWN_RISK:
            return labels.unknownRisk;
        default:
            return group.label;
    }
}
