import { apiClient } from './apiClient';
import type { LinkedControl, LinkedRisk } from '@/types/vendorLink';

export const vendorLinkApi = {
    async getLinkedRisks(vendorId: number): Promise<LinkedRisk[]> {
        return apiClient.get<LinkedRisk[]>(`/vendors/${vendorId}/linked-risks`);
    },

    async linkRisk(vendorId: number, riskId: number): Promise<void> {
        await apiClient.post(`/vendors/${vendorId}/linked-risks`, { risk_id: riskId });
    },

    async unlinkRisk(vendorId: number, riskId: number): Promise<void> {
        await apiClient.delete(`/vendors/${vendorId}/linked-risks/${riskId}`);
    },

    async getLinkedControls(vendorId: number): Promise<LinkedControl[]> {
        return apiClient.get<LinkedControl[]>(`/vendors/${vendorId}/linked-controls`);
    },

    async linkControl(vendorId: number, controlId: number): Promise<void> {
        await apiClient.post(`/vendors/${vendorId}/linked-controls`, { control_id: controlId });
    },

    async unlinkControl(vendorId: number, controlId: number): Promise<void> {
        await apiClient.delete(`/vendors/${vendorId}/linked-controls/${controlId}`);
    },
};

