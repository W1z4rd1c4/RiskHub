import { apiClient } from './apiClient';
import {
    assetVendorLinkListSchema,
    processVendorLinkListSchema,
    vendorListResponseSchema,
    vendorLookupOptionSchema,
    vendorSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { AssetVendorLink } from '@/types/asset';
import type { ProcessVendorLink } from '@/types/process';
import type {
    Vendor,
    VendorCreate,
    VendorListParams,
    VendorListResponse,
    VendorLookupOption,
    VendorUpdate,
} from '@/types/vendor';

export type VendorLookupKind =
    | 'outsourcing-owners'
    | 'departments'
    | 'processes'
    | 'assets'
    | 'risks'
    | 'controls'
    | 'kris';

function appendValues(params: URLSearchParams, key: string, values: ReadonlyArray<string | number> | undefined) {
    values?.forEach((value) => params.append(key, String(value)));
}

export function buildVendorCollectionQuery(params: VendorListParams): URLSearchParams {
    const query = new URLSearchParams();
    const set = (key: string, value: string | number | boolean | undefined) => {
        if (value !== undefined && value !== '') query.set(key, String(value));
    };

    set('offset', params.offset);
    set('limit', params.limit);
    set('search', params.search);
    set('include_archived', params.include_archived);
    set('sort_by', params.sort_by);
    set('sort_order', params.sort_order);
    if (params.sort) set('sort', JSON.stringify(params.sort));
    set('view', params.view);
    set('group_by', params.group_by);
    set('group_value', params.group_value);
    appendValues(query, 'lifecycle', params.lifecycle);
    appendValues(query, 'department_ids', params.department_ids);
    appendValues(query, 'outsourcing_owner_ids', params.outsourcing_owner_ids);
    appendValues(query, 'vendor_types', params.vendor_types);
    appendValues(query, 'risk_scores', params.risk_scores);
    appendValues(query, 'tiers', params.tiers);
    set('dora_relevant', params.dora_relevant);
    set('cif', params.cif);
    set('is_significant_vendor', params.is_significant_vendor);
    appendValues(query, 'substitutability', params.substitutability);
    appendValues(query, 'countries', params.countries);
    appendValues(query, 'country_categories', params.country_categories);
    set('has_roi_contract', params.has_roi_contract);
    set('has_sub_outsourcing', params.has_sub_outsourcing);
    set('has_direct_process_link', params.has_direct_process_link);
    appendValues(query, 'linked_process_ids', params.linked_process_ids);
    appendValues(query, 'linked_asset_ids', params.linked_asset_ids);
    appendValues(query, 'linked_risk_ids', params.linked_risk_ids);
    appendValues(query, 'linked_control_ids', params.linked_control_ids);
    appendValues(query, 'linked_kri_ids', params.linked_kri_ids);

    // Compatibility scalar vocabulary remains available to older callers.
    set('vendor_type', params.vendor_type);
    set('supports_important_core_insurance_function', params.supports_important_core_insurance_function);
    set('outsourcing_owner_user_id', params.outsourcing_owner_user_id);
    set('department_id', params.department_id);
    set('process', params.process);
    set('subprocess', params.subprocess);
    set('risk_score_1_5', params.risk_score_1_5);
    set('tier', params.tier);

    const filterEntries: Array<[string, unknown]> = [
        ['search', params.search],
        ['include_archived', params.include_archived],
        ['lifecycle', params.lifecycle],
        ['department_ids', params.department_ids],
        ['outsourcing_owner_ids', params.outsourcing_owner_ids],
        ['vendor_types', params.vendor_types],
        ['risk_scores', params.risk_scores],
        ['tiers', params.tiers],
        ['dora_relevant', params.dora_relevant],
        ['cif', params.cif],
        ['is_significant_vendor', params.is_significant_vendor],
        ['substitutability', params.substitutability],
        ['countries', params.countries],
        ['country_categories', params.country_categories],
        ['has_roi_contract', params.has_roi_contract],
        ['has_sub_outsourcing', params.has_sub_outsourcing],
        ['has_direct_process_link', params.has_direct_process_link],
        ['linked_process_ids', params.linked_process_ids],
        ['linked_asset_ids', params.linked_asset_ids],
        ['linked_risk_ids', params.linked_risk_ids],
        ['linked_control_ids', params.linked_control_ids],
        ['linked_kri_ids', params.linked_kri_ids],
    ];
    const filters = Object.fromEntries(filterEntries.filter(([, value]) => (
        value !== undefined && (!Array.isArray(value) || value.length > 0)
    )));
    if (Object.keys(filters).length > 0) set('filters', JSON.stringify(filters));
    return query;
}

async function downloadVendorExport(params: VendorListParams, locale: 'en' | 'cs'): Promise<void> {
    const query = buildVendorCollectionQuery(params);
    query.delete('offset');
    query.delete('limit');
    query.set('format', 'csv');
    query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/vendors/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? 'vendors.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const vendorApi = {
    async getVendors(params: VendorListParams): Promise<VendorListResponse> {
        return apiClient.get('/vendors', {
            params: buildVendorCollectionQuery(params),
            schema: vendorListResponseSchema,
        });
    },

    async getLookupOptions(
        kind: VendorLookupKind,
        options: { search?: string; selectedIds?: number[]; limit?: number } = {},
    ): Promise<VendorLookupOption[]> {
        return apiClient.get(`/vendors/lookups/${kind}`, {
            params: {
                search: options.search,
                selected_ids: options.selectedIds,
                limit: options.limit ?? 50,
            },
            schema: vendorLookupOptionSchema.array(),
        });
    },

    downloadExport: downloadVendorExport,

    async getVendor(id: number): Promise<Vendor> {
        return apiClient.get(`/vendors/${id}`, { schema: vendorSchema });
    },

    async createVendor(data: VendorCreate): Promise<Vendor> {
        return apiClient.post('/vendors', data, { schema: vendorSchema });
    },

    async updateVendor(id: number, data: VendorUpdate): Promise<Vendor> {
        return apiClient.patch(`/vendors/${id}`, data, { schema: vendorSchema });
    },

    async deleteVendor(id: number): Promise<void> {
        return apiClient.delete(`/vendors/${id}`, { schema: voidSchema });
    },

    async restoreVendor(id: number): Promise<Vendor> {
        return apiClient.post(`/vendors/${id}/restore`, {}, { schema: vendorSchema });
    },

    /** The Vendor-end reads of the ICT Register Link relations (issue #46). */
    async getAssetLinks(vendorId: number): Promise<AssetVendorLink[]> {
        return apiClient.get(`/vendors/${vendorId}/asset-links`, { schema: assetVendorLinkListSchema });
    },

    async getProcessLinks(vendorId: number): Promise<ProcessVendorLink[]> {
        return apiClient.get(`/vendors/${vendorId}/process-links`, { schema: processVendorLinkListSchema });
    },
};
