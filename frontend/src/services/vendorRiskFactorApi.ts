import { apiClient } from './apiClient';
import type { VendorRiskFactor, VendorRiskFactorCreate, VendorRiskFactorUpdate } from '@/types/vendorRisk';

export const vendorRiskFactorApi = {
    async getVendorRiskFactors(vendorId: number): Promise<VendorRiskFactor[]> {
        return apiClient.get<VendorRiskFactor[]>(`/vendors/${vendorId}/risk-factors`);
    },

    async createVendorRiskFactor(vendorId: number, data: VendorRiskFactorCreate): Promise<VendorRiskFactor> {
        return apiClient.post<VendorRiskFactor>(`/vendors/${vendorId}/risk-factors`, data);
    },

    async updateVendorRiskFactor(factorId: number, data: VendorRiskFactorUpdate): Promise<VendorRiskFactor> {
        return apiClient.patch<VendorRiskFactor>(`/vendor-risk-factors/${factorId}`, data);
    },

    async deleteVendorRiskFactor(factorId: number): Promise<void> {
        return apiClient.delete<void>(`/vendor-risk-factors/${factorId}`);
    },
};

