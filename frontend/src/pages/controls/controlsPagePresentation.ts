import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import {
    ControlStatus,
    type ControlMonitoringStatus,
} from '@/types/control';
import type { CollectionGroup } from '@/types/collection';

import { getCollectionGroupBy } from '../shared/collectionViewVocabulary';

export const CONTROL_GROUP_UNLINKED_VENDOR = '__unlinked_vendor__';
export const CONTROL_GROUP_UNCATEGORIZED = '__uncategorized__';
export const CONTROL_GROUP_UNKNOWN_DEPARTMENT = '__unknown_department__';
export const CONTROL_GROUP_NO_PROCESS = '__no_process__';
export const CONTROL_GROUP_UNKNOWN_RISK_TYPE = '__unknown_risk_type__';
export const CONTROL_GROUP_UNKNOWN_RISK = '__unknown_risk__';
const CONTROL_VIEW_MODE_GROUPS = {
    category: 'category',
    department: 'department',
    process: 'process',
    risk_type: 'risk_type',
    vendor: 'vendor',
    risk: 'risk',
} as const satisfies Partial<Record<ViewMode, string>>;

export type ControlListStatusFilter = '' | 'archived' | ControlMonitoringStatus;

interface BuildControlListParamsOptions {
    currentPage: number;
    limit?: number;
    search: string;
    statusFilter: ControlListStatusFilter;
    groupBy?: string | null;
    groupValue?: string | null;
}

interface BuildControlExportFiltersOptions {
    search: string;
    statusFilter: ControlListStatusFilter;
}

export function buildControlListParams({
    currentPage,
    limit = DEFAULT_LIST_PAGE_SIZE,
    search,
    statusFilter,
    groupBy,
    groupValue,
}: BuildControlListParamsOptions) {
    return {
        offset: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        status: statusFilter === 'archived' ? ControlStatus.ARCHIVED : undefined,
        monitoring_status: statusFilter && statusFilter !== 'archived' ? statusFilter : undefined,
        include_archived: statusFilter === 'archived',
        group_by: groupBy || undefined,
        group_value: groupValue || undefined,
    };
}

export function buildControlExportFilters({
    search,
    statusFilter,
}: BuildControlExportFiltersOptions) {
    return {
        status: statusFilter === 'archived' ? ControlStatus.ARCHIVED : null,
        monitoringStatus: statusFilter && statusFilter !== 'archived' ? statusFilter : null,
        search: search.trim() || null,
    };
}

export function getControlRiskLevelColor(level: number): string {
    if (level >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    if (level >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (level >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    if (level >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

export function getControlStatusColor(status: ControlStatus): string {
    switch (status) {
        case ControlStatus.ACTIVE:
            return 'text-emerald-400 bg-emerald-400/10';
        case ControlStatus.DRAFT:
            return 'text-slate-400 bg-slate-400/10';
        case ControlStatus.INACTIVE:
            return 'text-rose-400 bg-rose-400/10';
        case ControlStatus.ARCHIVED:
            return 'text-yellow-400 bg-yellow-400/10';
        case 'active':
        case 'draft':
        case 'inactive':
        case 'archived':
            return 'text-slate-400 bg-slate-400/10';
        default:
            return 'text-slate-400 bg-slate-400/10';
    }
}

export function getControlGroupBy(viewMode: ViewMode): string | null {
    return getCollectionGroupBy(viewMode, CONTROL_VIEW_MODE_GROUPS);
}

export function formatControlGroupLabel(
    group: CollectionGroup,
    labels: {
        unlinkedVendor: string;
        uncategorized: string;
        unknownDepartment: string;
        noProcess: string;
        unknownRiskType: string;
        unknownRisk: string;
        controlForm: (value: string) => string;
    },
): string {
    switch (group.value) {
        case CONTROL_GROUP_UNLINKED_VENDOR:
            return labels.unlinkedVendor;
        case CONTROL_GROUP_UNCATEGORIZED:
            return labels.uncategorized;
        case CONTROL_GROUP_UNKNOWN_DEPARTMENT:
            return labels.unknownDepartment;
        case CONTROL_GROUP_NO_PROCESS:
            return labels.noProcess;
        case CONTROL_GROUP_UNKNOWN_RISK_TYPE:
            return labels.unknownRiskType;
        case CONTROL_GROUP_UNKNOWN_RISK:
            return labels.unknownRisk;
        case 'manual':
        case 'automatic':
            return labels.controlForm(group.value);
        default:
            return group.label;
    }
}
