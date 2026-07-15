import { apiClient } from './apiClient';
import { buildCollectionParams, normalizeCollectionResponse } from './collectionApi';
import {
    assetVendorLinkListSchema,
    processVendorLinkListSchema,
    vendorListResponseSchema,
    vendorSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { AssetVendorLink } from '@/types/asset';
import type { ProcessVendorLink } from '@/types/process';
import type { Vendor, VendorCreate, VendorListParams, VendorListResponse, VendorUpdate } from '@/types/vendor';

export const vendorApi = {
    async getVendors(params: VendorListParams): Promise<VendorListResponse> {
        const response = await apiClient.get('/vendors', {
            params: {
                ...buildCollectionParams({
                    offset: params.offset,
                    limit: params.limit,
                    filters: {
                    search: params.search,
                    include_archived: params.include_archived,
                    vendor_type: params.vendor_type,
                    dora_relevant: params.dora_relevant,
                    supports_important_core_insurance_function: params.supports_important_core_insurance_function,
                    is_significant_vendor: params.is_significant_vendor,
                    outsourcing_owner_user_id: params.outsourcing_owner_user_id,
                    department_id: params.department_id,
                    process: params.process,
                    subprocess: params.subprocess,
                    risk_score_1_5: params.risk_score_1_5,
                    },
                    sort: params.sort_by ? { field: params.sort_by, direction: params.sort_order ?? 'asc' } : null,
                    groupBy: params.group_by,
                    groupValue: params.group_value,
                }),
                has_direct_process_link: params.has_direct_process_link,
                has_roi_contract: params.has_roi_contract,
                has_sub_outsourcing: params.has_sub_outsourcing,
                tier: params.tier,
            },
            schema: vendorListResponseSchema,
        });
        return normalizeCollectionResponse(response);
    },

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
