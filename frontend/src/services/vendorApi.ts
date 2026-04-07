import { apiClient } from './apiClient';
import type { Vendor, VendorCreate, VendorListParams, VendorListResponse, VendorUpdate } from '@/types/vendor';

type VendorQueryParams = Record<string, string | number | boolean | null | undefined>;

export const vendorApi = {
    async getVendors(params: VendorListParams): Promise<VendorListResponse> {
        return apiClient.get<VendorListResponse>('/vendors', {
            params: params as VendorQueryParams,
        });
    },

    async getVendor(id: number): Promise<Vendor> {
        return apiClient.get<Vendor>(`/vendors/${id}`);
    },

    async createVendor(data: VendorCreate): Promise<Vendor> {
        return apiClient.post<Vendor>('/vendors', data);
    },

    async updateVendor(id: number, data: VendorUpdate): Promise<Vendor> {
        return apiClient.patch<Vendor>(`/vendors/${id}`, data);
    },

    async deleteVendor(id: number): Promise<void> {
        return apiClient.delete<void>(`/vendors/${id}`);
    },

    async restoreVendor(id: number): Promise<Vendor> {
        return apiClient.post<Vendor>(`/vendors/${id}/restore`, {});
    },
};
