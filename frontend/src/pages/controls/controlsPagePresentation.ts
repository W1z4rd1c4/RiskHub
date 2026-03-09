import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE, GROUPED_VIEW_FETCH_PAGE_SIZE } from '@/constants/list';
import { controlApi } from '@/services/controlApi';
import {
    ControlStatus,
    type ControlMonitoringStatus,
    type ControlSummary,
} from '@/types/control';

export interface ControlGroupedRow {
    groupValue: string;
    control: ControlSummary;
    rowId: string;
}

export type ControlListStatusFilter = '' | 'archived' | ControlMonitoringStatus;

interface BuildControlListParamsOptions {
    currentPage: number;
    limit?: number;
    search: string;
    statusFilter: ControlListStatusFilter;
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
}: BuildControlListParamsOptions) {
    return {
        skip: (currentPage - 1) * limit,
        limit,
        search: search.trim() || undefined,
        status: statusFilter === 'archived' ? ControlStatus.ARCHIVED : undefined,
        monitoring_status: statusFilter && statusFilter !== 'archived' ? statusFilter : undefined,
        include_archived: statusFilter === 'archived',
    };
}

export async function fetchAllControlsForGroupedView({
    search,
    statusFilter,
}: Omit<BuildControlListParamsOptions, 'currentPage' | 'limit'>): Promise<{
    items: ControlSummary[];
    total: number;
}> {
    const limit = GROUPED_VIEW_FETCH_PAGE_SIZE;
    const allItems: ControlSummary[] = [];
    let skip = 0;
    let total: number;

    do {
        const response = await controlApi.getControls({
            ...buildControlListParams({
                currentPage: 1,
                limit,
                search,
                statusFilter,
            }),
            skip,
            limit,
        });
        total = response.total;
        allItems.push(...response.items);
        skip += limit;
    } while (skip < total);

    return { items: allItems, total };
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
        default:
            return 'text-slate-400 bg-slate-400/10';
    }
}

export function getControlGroupByField(viewMode: ViewMode): keyof ControlSummary | null {
    switch (viewMode) {
        case 'category':
            return 'control_form';
        case 'department':
            return 'department_name';
        case 'process':
            return 'frequency';
        case 'risk_type':
            return 'risk_type';
        case 'risk':
            return 'risk_name';
        default:
            return null;
    }
}

export function buildControlGroupedRows(
    items: ControlSummary[],
    viewMode: ViewMode,
    labels: { unlinkedVendor: string }
): ControlGroupedRow[] {
    if (viewMode !== 'vendor') {
        return [];
    }

    return items.flatMap((control) => {
        const vendors = control.linked_vendors ?? [];
        if (vendors.length === 0) {
            return [
                {
                    groupValue: labels.unlinkedVendor,
                    control,
                    rowId: `${control.id}:unlinked-vendor`,
                },
            ];
        }

        return vendors.map((vendor) => ({
            groupValue: vendor.name,
            control,
            rowId: `${control.id}:${vendor.id}`,
        }));
    });
}
