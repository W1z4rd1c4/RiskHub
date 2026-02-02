import { apiClient } from './apiClient';
import type {
    VendorSLA,
    VendorSLACreate,
    VendorSLAHistoryResponse,
    VendorSLAUpdate,
    VendorSLAValueCreate,
} from '@/types/vendorSla';

export const vendorSlaApi = {
    list: (params?: { vendor_id?: number; include_archived?: boolean }) =>
        apiClient.get<VendorSLA[]>('/vendor-slas', { params }),

    create: (payload: VendorSLACreate) =>
        apiClient.post<VendorSLA>('/vendor-slas', payload),

    get: (slaId: number) =>
        apiClient.get<VendorSLA>(`/vendor-slas/${slaId}`),

    update: (slaId: number, payload: VendorSLAUpdate) =>
        apiClient.put<VendorSLA>(`/vendor-slas/${slaId}`, payload),

    archive: (slaId: number) =>
        apiClient.delete<void>(`/vendor-slas/${slaId}`),

    recordValue: (slaId: number, payload: VendorSLAValueCreate) =>
        apiClient.post<VendorSLA>(`/vendor-slas/${slaId}/values`, payload),

    history: (slaId: number, limit = 100) =>
        apiClient.get<VendorSLAHistoryResponse>(`/vendor-slas/${slaId}/history`, { params: { limit } }),
};

