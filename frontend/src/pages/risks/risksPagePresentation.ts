import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import type { CollectionGroup } from '@/types/collection';
import type { RiskStatus, RiskSummary } from '@/types/risk';

import { getCollectionGroupBy } from '../shared/collectionViewVocabulary';

export const CRITICAL_RISK_MIN_NET_SCORE = 15;
export const RISK_GROUP_UNLINKED_VENDOR = '__unlinked_vendor__';
export const RISK_GROUP_UNCATEGORIZED = '__uncategorized__';
export const RISK_GROUP_UNKNOWN_DEPARTMENT = '__unknown_department__';
export const RISK_GROUP_NO_PROCESS = '__no_process__';
export const RISK_GROUP_UNKNOWN_RISK_TYPE = '__unknown_risk_type__';
const RISK_VIEW_MODE_GROUPS = {
    category: 'category',
    department: 'department',
    process: 'process',
    risk_type: 'risk_type',
    vendor: 'vendor',
} as const satisfies Partial<Record<ViewMode, string>>;

export interface RisksPageInitialState {
    criticalFilter: boolean;
    hasBreachFilter: boolean | undefined;
}

interface BuildRiskListParamsOptions {
    currentPage: number;
    criticalFilter: boolean;
    hasBreachFilter: boolean | undefined;
    limit?: number;
    priorityFilter: boolean | undefined;
    search: string;
    sortDirection: SortDirection;
    sortField: string | null;
    statusFilter: RiskStatus | '';
    typeFilter: string;
    groupBy?: string | null;
    groupValue?: string | null;
}

interface BuildRiskExportFiltersOptions {
    priorityFilter: boolean | undefined;
    search: string;
    statusFilter: RiskStatus | '';
    typeFilter: string;
}

export function parseRisksPageQueryParams(searchParams: URLSearchParams): RisksPageInitialState {
    return {
        hasBreachFilter: searchParams.get('breached') === 'true' ? true : undefined,
        criticalFilter: searchParams.get('critical') === 'true',
    };
}

export function normalizeRiskSummary(risk: RiskSummary): RiskSummary {
    return {
        ...risk,
        kri_count: risk.kri_count ?? 0,
        has_breach: risk.has_breach ?? false,
        control_count: risk.control_count ?? 0,
        linked_vendors: risk.linked_vendors ?? [],
    };
}

export function normalizeRiskSummaries(items: RiskSummary[]): RiskSummary[] {
    return items.map(normalizeRiskSummary);
}

export function buildRiskListParams({
    currentPage,
    criticalFilter,
    hasBreachFilter,
    limit = DEFAULT_LIST_PAGE_SIZE,
    priorityFilter,
    search,
    sortDirection,
    sortField,
    statusFilter,
    typeFilter,
    groupBy,
    groupValue,
}: BuildRiskListParamsOptions) {
    return {
        offset: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        risk_type: typeFilter || undefined,
        is_priority: priorityFilter,
        has_breach: hasBreachFilter,
        min_net_score: criticalFilter ? CRITICAL_RISK_MIN_NET_SCORE : undefined,
        sort_by: sortField || undefined,
        sort_order: sortDirection || undefined,
        include_archived: statusFilter === 'archived',
        group_by: groupBy || undefined,
        group_value: groupValue || undefined,
    };
}

export function buildRiskExportFilters({
    priorityFilter,
    search,
    statusFilter,
    typeFilter,
}: BuildRiskExportFiltersOptions) {
    return {
        status: statusFilter || null,
        search: search.trim() || null,
        riskType: typeFilter || null,
        isPriority: priorityFilter ?? null,
    };
}

export function getRiskGroupBy(viewMode: ViewMode): string | null {
    return getCollectionGroupBy(viewMode, RISK_VIEW_MODE_GROUPS);
}

export function formatRiskGroupLabel(
    group: CollectionGroup,
    labels: {
        unlinkedVendor: string;
        uncategorized: string;
        unknownDepartment: string;
        noProcess: string;
        unknownRiskType: string;
    },
): string {
    switch (group.value) {
        case RISK_GROUP_UNLINKED_VENDOR:
            return labels.unlinkedVendor;
        case RISK_GROUP_UNCATEGORIZED:
            return labels.uncategorized;
        case RISK_GROUP_UNKNOWN_DEPARTMENT:
            return labels.unknownDepartment;
        case RISK_GROUP_NO_PROCESS:
            return labels.noProcess;
        case RISK_GROUP_UNKNOWN_RISK_TYPE:
            return labels.unknownRiskType;
        default:
            return group.label;
    }
}
