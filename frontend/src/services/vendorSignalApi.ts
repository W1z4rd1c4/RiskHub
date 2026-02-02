import { apiClient } from './apiClient';
import type { VendorExternalSignal } from '@/types/vendorSignal';

export const vendorSignalApi = {
    list: (vendorId: number) =>
        apiClient.get<VendorExternalSignal[]>(`/vendors/${vendorId}/signals`),

    refresh: (vendorId: number) =>
        apiClient.post<VendorExternalSignal[]>(`/vendors/${vendorId}/signals/refresh`, {}),
};

