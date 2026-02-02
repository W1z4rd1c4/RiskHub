import { apiClient } from './apiClient';
import type { VendorResilience, VendorResilienceUpdate } from '@/types/vendorResilience';

export const vendorResilienceApi = {
    getResilience: (vendorId: number) =>
        apiClient.get<VendorResilience>(`/vendors/${vendorId}/resilience`),

    updateResilience: (vendorId: number, payload: VendorResilienceUpdate) =>
        apiClient.patch<VendorResilience>(`/vendors/${vendorId}/resilience`, payload),
};

