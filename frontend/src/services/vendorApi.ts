import { apiClient } from './apiClient';
import { vendorListResponseSchema, vendorSchema, voidSchema } from '@/services/api/schemas';
import type { Vendor, VendorCreate, VendorListParams, VendorListResponse, VendorUpdate } from '@/types/vendor';

type VendorQueryParams = Record<string, string | number | boolean | null | undefined>;

export const vendorApi = {
    async getVendors(params: VendorListParams): Promise<VendorListResponse> {
        return apiClient.get('/vendors', {
            params: params as VendorQueryParams,
            schema: vendorListResponseSchema,
        });
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
};
