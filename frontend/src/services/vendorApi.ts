import { apiClient } from './apiClient';
import type { Vendor, VendorCreate, VendorListResponse, VendorUpdate } from '@/types/vendor';

export const vendorApi = {
    async getVendors(params: {
        skip?: number;
        limit?: number;
        search?: string;
        status?: string;
        include_archived?: boolean;
        vendor_type?: string;
        dora_relevant?: boolean;
        supports_important_core_insurance_function?: boolean;
        is_significant_vendor?: boolean;
        outsourcing_owner_user_id?: number;
        department_id?: number;
        process?: string;
        subprocess?: string;
        risk_score_1_5?: number;
        sort_by?: string;
        sort_order?: 'asc' | 'desc';
    }): Promise<VendorListResponse> {
        return apiClient.get<VendorListResponse>('/vendors', { params });
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

    async triggerReassessment(id: number, reason: string): Promise<Vendor> {
        return apiClient.post<Vendor>(`/vendors/${id}/trigger-reassessment`, { reason });
    },
};
