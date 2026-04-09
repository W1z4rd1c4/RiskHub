import { apiClient } from './apiClient';
import {
    linkStatusSchema,
    linkedControlArraySchema,
    linkedKRIArraySchema,
    linkedRiskArraySchema,
    voidSchema,
} from '@/services/api/schemas';
import type { LinkedControl, LinkedKRI, LinkedRisk } from '@/types/vendorLink';

export const vendorLinkApi = {
    async getLinkedRisks(vendorId: number): Promise<LinkedRisk[]> {
        return apiClient.get(`/vendors/${vendorId}/linked-risks`, { schema: linkedRiskArraySchema });
    },

    async linkRisk(vendorId: number, riskId: number): Promise<void> {
        await apiClient.post(`/vendors/${vendorId}/linked-risks`, { risk_id: riskId }, { schema: linkStatusSchema });
    },

    async unlinkRisk(vendorId: number, riskId: number): Promise<void> {
        await apiClient.delete(`/vendors/${vendorId}/linked-risks/${riskId}`, { schema: voidSchema });
    },

    async getLinkedControls(vendorId: number): Promise<LinkedControl[]> {
        return apiClient.get(`/vendors/${vendorId}/linked-controls`, { schema: linkedControlArraySchema });
    },

    async linkControl(vendorId: number, controlId: number): Promise<void> {
        await apiClient.post(`/vendors/${vendorId}/linked-controls`, { control_id: controlId }, { schema: linkStatusSchema });
    },

    async unlinkControl(vendorId: number, controlId: number): Promise<void> {
        await apiClient.delete(`/vendors/${vendorId}/linked-controls/${controlId}`, { schema: voidSchema });
    },

    async getLinkedKRIs(vendorId: number): Promise<LinkedKRI[]> {
        return apiClient.get(`/vendors/${vendorId}/linked-kris`, { schema: linkedKRIArraySchema });
    },

    async linkKRI(vendorId: number, kriId: number): Promise<void> {
        await apiClient.post(`/vendors/${vendorId}/linked-kris`, { kri_id: kriId }, { schema: linkStatusSchema });
    },

    async unlinkKRI(vendorId: number, kriId: number): Promise<void> {
        await apiClient.delete(`/vendors/${vendorId}/linked-kris/${kriId}`, { schema: voidSchema });
    },
};
