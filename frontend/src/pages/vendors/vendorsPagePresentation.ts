import type { ViewMode } from '@/components/tables';
import type { CollectionGroup } from '@/types/collection';
import type { Vendor, VendorListParams, VendorStatus, VendorType } from '@/types/vendor';

import { getCollectionGroupBy } from '../shared/collectionViewVocabulary';

export const VENDOR_GROUP_UNASSIGNED = '__unassigned__';
export const VENDOR_GROUP_NO_PROCESS = '__no_process__';
export const VENDOR_GROUP_UNLINKED_RISK = '__unlinked_risk__';
export const VENDOR_GROUP_DORA_RELEVANT = '__dora_relevant__';
export const VENDOR_GROUP_SUPPORTS_CORE_FUNCTION = '__supports_core_function__';
export const VENDOR_GROUP_SIGNIFICANT_VENDOR = '__significant_vendor__';
export const VENDOR_GROUP_INSIGNIFICANT_VENDOR = '__insignificant_vendor__';
const VENDOR_VIEW_MODE_GROUPS = {
    department: 'department',
    process: 'process',
    type: 'type',
    risk: 'risk',
    flag: 'flag',
} as const satisfies Partial<Record<ViewMode, string>>;

export type VendorListStatusFilter = VendorStatus | 'inactive' | '';
export type VendorDisplayStatus = VendorStatus | 'inactive';

export function getVendorDisplayStatus(vendor: Pick<Vendor, 'status' | 'is_archived'>): VendorDisplayStatus {
    return vendor.is_archived ? 'inactive' : vendor.status;
}

interface BuildVendorListParamsOptions {
    currentPage: number;
    debouncedSearch: string;
    includeArchived: boolean;
    limit: number;
    sortDirection: 'asc' | 'desc' | null;
    sortField: VendorListParams['sort_by'] | null;
    statusFilter: VendorListStatusFilter;
    typeFilter: VendorType | '';
    groupBy?: string | null;
    groupValue?: string | null;
}

interface BuildVendorExportFiltersOptions {
    search: string;
    statusFilter: VendorListStatusFilter;
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
    groupBy,
    groupValue,
}: BuildVendorListParamsOptions): VendorListParams {
    const params: VendorListParams = {
        offset: (currentPage - 1) * limit,
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
    if (groupBy) {
        params.group_by = groupBy;
    }
    if (groupValue) {
        params.group_value = groupValue;
    }

    return params;
}

export function buildVendorExportFilters({
    search,
    statusFilter,
    typeFilter,
}: BuildVendorExportFiltersOptions): {
    search: string | null;
    status: VendorListStatusFilter | null;
    vendorType: VendorType | null;
} {
    return {
        status: statusFilter || null,
        search: search.trim() || null,
        vendorType: typeFilter || null,
    };
}

export function getVendorGroupBy(viewMode: ViewMode): string | null {
    return getCollectionGroupBy(viewMode, VENDOR_VIEW_MODE_GROUPS);
}

export function formatVendorGroupLabel(
    group: CollectionGroup,
    labels: {
        noProcess: string;
        typeLabel: (value: VendorType) => string;
        unassigned: string;
        unlinkedRisk: string;
        doraRelevant: string;
        supportsCoreFunction: string;
        significantVendor: string;
        insignificantVendor: string;
    }
): string {
    switch (group.value) {
        case VENDOR_GROUP_UNASSIGNED:
            return labels.unassigned;
        case VENDOR_GROUP_NO_PROCESS:
            return labels.noProcess;
        case VENDOR_GROUP_UNLINKED_RISK:
            return labels.unlinkedRisk;
        case VENDOR_GROUP_DORA_RELEVANT:
            return labels.doraRelevant;
        case VENDOR_GROUP_SUPPORTS_CORE_FUNCTION:
            return labels.supportsCoreFunction;
        case VENDOR_GROUP_SIGNIFICANT_VENDOR:
            return labels.significantVendor;
        case VENDOR_GROUP_INSIGNIFICANT_VENDOR:
            return labels.insignificantVendor;
        case 'ict':
        case 'outsourcing':
        case 'professional_services':
        case 'partner':
        case 'other':
            return labels.typeLabel(group.value);
        default:
            return group.label;
    }
}
