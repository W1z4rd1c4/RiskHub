import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE, GROUPED_VIEW_FETCH_PAGE_SIZE } from '@/constants/list';
import { riskApi } from '@/services/riskApi';
import type { RiskStatus, RiskSummary } from '@/types/risk';

export const CRITICAL_RISK_MIN_NET_SCORE = 15;

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
}: BuildRiskListParamsOptions) {
    return {
        skip: (currentPage - 1) * limit,
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
    };
}

export async function fetchAllRisksForGroupedView({
    criticalFilter,
    hasBreachFilter,
    priorityFilter,
    search,
    sortDirection,
    sortField,
    statusFilter,
    typeFilter,
}: Omit<BuildRiskListParamsOptions, 'currentPage' | 'limit'>): Promise<{
    items: RiskSummary[];
    total: number;
}> {
    const limit = GROUPED_VIEW_FETCH_PAGE_SIZE;
    const allItems: RiskSummary[] = [];
    let skip = 0;
    let total: number;

    do {
        const response = await riskApi.getRisks({
            ...buildRiskListParams({
                currentPage: 1,
                limit,
                criticalFilter,
                hasBreachFilter,
                priorityFilter,
                search,
                sortDirection,
                sortField,
                statusFilter,
                typeFilter,
            }),
            skip,
            limit,
        });
        total = response.total;
        allItems.push(...normalizeRiskSummaries(response.items));
        skip += limit;
    } while (skip < total);

    return { items: allItems, total };
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

export function getRiskGroupByField(viewMode: ViewMode): keyof RiskSummary | null {
    switch (viewMode) {
        case 'category':
            return 'category';
        case 'department':
            return 'department_name';
        case 'process':
            return 'process';
        case 'risk_type':
            return 'risk_type';
        default:
            return null;
    }
}
