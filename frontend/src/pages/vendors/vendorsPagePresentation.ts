import type { ViewMode } from '@/components/tables';
import { GROUPED_VIEW_FETCH_PAGE_SIZE } from '@/constants/list';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor, VendorListParams, VendorStatus, VendorType } from '@/types/vendor';

export interface VendorGroupedRow {
    groupValue: string;
    rowId: string;
    vendor: Vendor;
}

interface BuildVendorListParamsOptions {
    currentPage: number;
    debouncedSearch: string;
    includeArchived: boolean;
    limit: number;
    sortDirection: 'asc' | 'desc' | null;
    sortField: VendorListParams['sort_by'] | null;
    statusFilter: VendorStatus | '';
    typeFilter: VendorType | '';
}

interface BuildVendorExportFiltersOptions {
    search: string;
    statusFilter: VendorStatus | '';
    typeFilter: VendorType | '';
}

export function buildVendorListParams({
    currentPage,
    debouncedSearch,
    includeArchived,
    limit,
    sortDirection,
    sortField,
    statusFilter,
    typeFilter,
}: BuildVendorListParamsOptions): VendorListParams {
    const params: VendorListParams = {
        skip: (currentPage - 1) * limit,
        limit,
        include_archived: includeArchived,
    };

    if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
    }
    if (statusFilter) {
        params.status = statusFilter;
    }
    if (typeFilter) {
        params.vendor_type = typeFilter;
    }
    if (sortField && sortDirection) {
        params.sort_by = sortField;
        params.sort_order = sortDirection;
    }

    return params;
}

export function buildVendorExportFilters({
    search,
    statusFilter,
    typeFilter,
}: BuildVendorExportFiltersOptions): {
    search: string | null;
    status: VendorStatus | null;
    vendorType: VendorType | null;
} {
    return {
        status: statusFilter || null,
        search: search.trim() || null,
        vendorType: typeFilter || null,
    };
}

export async function fetchAllVendorsForGroupedView(
    params: Omit<BuildVendorListParamsOptions, 'currentPage' | 'limit'>
): Promise<{
    items: Vendor[];
    total: number;
}> {
    const limit = GROUPED_VIEW_FETCH_PAGE_SIZE;
    const allItems: Vendor[] = [];
    let skip = 0;
    let total = 0;

    do {
        const response = await vendorApi.getVendors({
            ...buildVendorListParams({
                ...params,
                currentPage: 1,
                limit,
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

function linkedRiskLabel(vendor: Vendor): Array<{ groupValue: string; rowId: string }> {
    const seen = new Set<number>();
    const rows: Array<{ groupValue: string; rowId: string }> = [];

    for (const risk of vendor.linked_risks ?? []) {
        if (seen.has(risk.risk_id)) {
            continue;
        }
        seen.add(risk.risk_id);
        rows.push({
            groupValue: `${risk.risk_id_code}: ${risk.risk_name}`,
            rowId: `${vendor.id}:${risk.risk_id}`,
        });
    }

    return rows;
}

export function buildVendorGroupedRows(
    items: Vendor[],
    viewMode: ViewMode,
    labels: {
        noProcess: string;
        typeLabel: (value: VendorType) => string;
        unassigned: string;
        unlinkedRisk: string;
    }
): VendorGroupedRow[] {
    if (viewMode === 'all' || viewMode === 'category' || viewMode === 'risk_type') {
        return [];
    }

    return items.flatMap((vendor) => {
        if (viewMode === 'department') {
            return [
                {
                    groupValue: vendor.department_name?.trim() || labels.unassigned,
                    rowId: `${vendor.id}:department`,
                    vendor,
                },
            ];
        }

        if (viewMode === 'process') {
            return [
                {
                    groupValue: vendor.process?.trim() || labels.noProcess,
                    rowId: `${vendor.id}:process`,
                    vendor,
                },
            ];
        }

        if (viewMode === 'type') {
            return [
                {
                    groupValue: labels.typeLabel(vendor.vendor_type),
                    rowId: `${vendor.id}:type`,
                    vendor,
                },
            ];
        }

        const linkedRisks = linkedRiskLabel(vendor);
        if (linkedRisks.length === 0) {
            return [
                {
                    groupValue: labels.unlinkedRisk,
                    rowId: `${vendor.id}:unlinked-risk`,
                    vendor,
                },
            ];
        }

        return linkedRisks.map((risk) => ({
            groupValue: risk.groupValue,
            rowId: risk.rowId,
            vendor,
        }));
    });
}
